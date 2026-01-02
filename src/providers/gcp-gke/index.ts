import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import { ClusterConfig, ClusterOutput, instanceSizeMapping } from "../../types";

/**
 * Creates a GCP GKE cluster with VPC and node pools
 * By default creates a zonal cluster to reduce quota usage and costs.
 */
export function createGkeCluster(config: ClusterConfig): ClusterOutput {
  if (!config.gcp) {
    throw new Error("GCP configuration is required for GKE cluster");
  }

  // Use zonal cluster by default to reduce quota usage
  // Regional clusters replicate nodes across all zones (3x resources)
  const useZonalCluster = config.gcp.zonalCluster !== false;
  const clusterLocation = useZonalCluster
    ? (config.gcp.zone || `${config.region}-b`)
    : config.region;

  const labels = Object.fromEntries(
    Object.entries(config.tags).map(([k, v]) => [
      k.toLowerCase().replace(/[^a-z0-9_-]/g, "_"),
      v.toLowerCase().replace(/[^a-z0-9_-]/g, "_"),
    ])
  );

  // Create VPC network
  const network = new gcp.compute.Network("vpc", {
    name: `${config.clusterName}-vpc`,
    autoCreateSubnetworks: false,
    project: config.gcp.projectId,
  });

  // Create subnet
  const subnet = new gcp.compute.Subnetwork("subnet", {
    name: `${config.clusterName}-subnet`,
    network: network.id,
    ipCidrRange: config.network.privateSubnetCidrs[0],
    region: config.region,
    project: config.gcp.projectId,
    privateIpGoogleAccess: true,
    secondaryIpRanges: [
      {
        rangeName: "pods",
        ipCidrRange: "10.1.0.0/16",
      },
      {
        rangeName: "services",
        ipCidrRange: "10.2.0.0/20",
      },
    ],
  });

  // Create Cloud Router for NAT
  const router = new gcp.compute.Router("router", {
    name: `${config.clusterName}-router`,
    network: network.id,
    region: config.region,
    project: config.gcp.projectId,
  });

  // Create Cloud NAT
  new gcp.compute.RouterNat("nat", {
    name: `${config.clusterName}-nat`,
    router: router.name,
    region: config.region,
    project: config.gcp.projectId,
    natIpAllocateOption: "AUTO_ONLY",
    sourceSubnetworkIpRangesToNat: "ALL_SUBNETWORKS_ALL_IP_RANGES",
  });

  // Create GKE cluster (zonal by default to reduce quota usage)
  const cluster = new gcp.container.Cluster("gke-cluster", {
    name: config.clusterName,
    location: clusterLocation,
    project: config.gcp.projectId,

    // Network configuration
    network: network.name,
    subnetwork: subnet.name,
    
    ipAllocationPolicy: {
      clusterSecondaryRangeName: "pods",
      servicesSecondaryRangeName: "services",
    },

    // Use release channel for automatic upgrades
    releaseChannel: {
      channel: "REGULAR",
    },

    // We'll create node pools separately
    removeDefaultNodePool: true,
    initialNodeCount: 1,

    // Enable Workload Identity
    workloadIdentityConfig: config.gcp.enableWorkloadIdentity
      ? {
          workloadPool: `${config.gcp.projectId}.svc.id.goog`,
        }
      : undefined,

    // Private cluster configuration
    privateClusterConfig: config.gcp.privateCluster
      ? {
          enablePrivateNodes: true,
          enablePrivateEndpoint: false,
          masterIpv4CidrBlock: "172.16.0.0/28",
        }
      : undefined,

    // Enable network policy
    networkPolicy: {
      enabled: true,
      provider: "CALICO",
    },

    addonsConfig: {
      httpLoadBalancing: {
        disabled: false,
      },
      horizontalPodAutoscaling: {
        disabled: false,
      },
      gcePersistentDiskCsiDriverConfig: {
        enabled: true,
      },
    },

    resourceLabels: labels,
  });

  // Create node pools
  config.nodePools.forEach((nodePool, index) => {
    new gcp.container.NodePool(`nodepool-${nodePool.name}`, {
      name: nodePool.name,
      cluster: cluster.name,
      location: clusterLocation,
      project: config.gcp!.projectId,

      nodeCount: nodePool.desiredSize,

      autoscaling: {
        minNodeCount: nodePool.minSize,
        maxNodeCount: nodePool.maxSize,
      },

      nodeConfig: {
        machineType: instanceSizeMapping.gcp[nodePool.instanceSize],
        diskSizeGb: nodePool.diskSizeGb,
        diskType: "pd-standard",

        oauthScopes: [
          "https://www.googleapis.com/auth/cloud-platform",
        ],

        labels: nodePool.labels,

        taints: nodePool.taints?.map(t => ({
          key: t.key,
          value: t.value,
          effect: t.effect.toUpperCase().replace("NOSCHEDULE", "NO_SCHEDULE").replace("NOEXECUTE", "NO_EXECUTE"),
        })),

        // Enable Workload Identity on nodes
        workloadMetadataConfig: config.gcp?.enableWorkloadIdentity
          ? {
              mode: "GKE_METADATA",
            }
          : undefined,

        shieldedInstanceConfig: {
          enableSecureBoot: true,
          enableIntegrityMonitoring: true,
        },
      },

      management: {
        autoRepair: true,
        autoUpgrade: true,
      },
    });
  });

  // Generate kubeconfig
  const kubeconfig = pulumi.all([cluster.name, cluster.endpoint, cluster.masterAuth]).apply(
    ([name, endpoint, auth]) => {
      const context = `gke_${config.gcp!.projectId}_${clusterLocation}_${name}`;
      return JSON.stringify({
        apiVersion: "v1",
        kind: "Config",
        clusters: [{
          name: context,
          cluster: {
            "certificate-authority-data": auth.clusterCaCertificate,
            server: `https://${endpoint}`,
          },
        }],
        contexts: [{
          name: context,
          context: {
            cluster: context,
            user: context,
          },
        }],
        "current-context": context,
        users: [{
          name: context,
          user: {
            exec: {
              apiVersion: "client.authentication.k8s.io/v1beta1",
              command: "gke-gcloud-auth-plugin",
              installHint: "Install gke-gcloud-auth-plugin for kubectl auth",
              provideClusterInfo: true,
            },
          },
        }],
      });
    }
  );

  return {
    clusterName: cluster.name,
    kubeconfig: kubeconfig,
    endpoint: cluster.endpoint,
    clusterId: cluster.id,
  };
}

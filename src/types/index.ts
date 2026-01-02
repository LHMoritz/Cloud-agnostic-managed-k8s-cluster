import * as pulumi from "@pulumi/pulumi";

/**
 * Supported cloud providers
 */
export type CloudProvider = "aws" | "gcp" | "azure";

/**
 * Node pool taint configuration
 */
export interface NodeTaint {
  key: string;
  value: string;
  effect: "NoSchedule" | "PreferNoSchedule" | "NoExecute";
}

/**
 * Node pool configuration (cloud-agnostic)
 */
export interface NodePoolConfig {
  /** Name of the node pool */
  name: string;
  /** Instance type (will be mapped to provider-specific types) */
  instanceSize: "small" | "medium" | "large" | "xlarge";
  /** Minimum number of nodes */
  minSize: number;
  /** Maximum number of nodes */
  maxSize: number;
  /** Desired number of nodes */
  desiredSize: number;
  /** Disk size in GB */
  diskSizeGb: number;
  /** Node labels */
  labels?: Record<string, string>;
  /** Node taints */
  taints?: NodeTaint[];
}

/**
 * Network configuration
 */
export interface NetworkConfig {
  /** VPC/VNet CIDR block */
  vpcCidr: string;
  /** Private subnet CIDRs */
  privateSubnetCidrs: string[];
  /** Public subnet CIDRs (optional, mainly for AWS) */
  publicSubnetCidrs?: string[];
}

/**
 * Main cluster configuration
 */
export interface ClusterConfig {
  /** Cloud provider to deploy to */
  provider: CloudProvider;
  /** Cluster name */
  clusterName: string;
  /** Kubernetes version */
  kubernetesVersion: string;
  /** Cloud region */
  region: string;
  /** Network configuration */
  network: NetworkConfig;
  /** Node pool configurations */
  nodePools: NodePoolConfig[];
  /** Common tags/labels */
  tags: Record<string, string>;

  // Provider-specific options
  /** AWS-specific configuration */
  aws?: AwsConfig;
  /** GCP-specific configuration */
  gcp?: GcpConfig;
  /** Azure-specific configuration */
  azure?: AzureConfig;
}

/**
 * AWS-specific configuration
 */
export interface AwsConfig {
  /** Enable private cluster (no public endpoint) */
  privateCluster?: boolean;
  /** Enable EKS add-ons */
  enableAddons?: {
    vpcCni?: boolean;
    coreDns?: boolean;
    kubeProxy?: boolean;
    ebsCsiDriver?: boolean;
  };
}

/**
 * GCP-specific configuration
 */
export interface GcpConfig {
  /** GCP Project ID */
  projectId: string;
  /** Enable private cluster */
  privateCluster?: boolean;
  /** Enable Workload Identity */
  enableWorkloadIdentity?: boolean;
  /** Use zonal cluster instead of regional (reduces costs and quota usage) */
  zonalCluster?: boolean;
  /** Specific zone for zonal cluster (e.g., "europe-west1-b"). If not set, "-b" is appended to region */
  zone?: string;
}

/**
 * Azure-specific configuration
 */
export interface AzureConfig {
  /** Azure Resource Group name */
  resourceGroupName: string;
  /** Azure Subscription ID */
  subscriptionId?: string;
  /** Enable Azure AD integration */
  enableAzureAd?: boolean;
}

/**
 * Cluster output interface (what each provider module returns)
 */
export interface ClusterOutput {
  /** Cluster name */
  clusterName: pulumi.Output<string>;
  /** Kubernetes API endpoint */
  kubeconfig: pulumi.Output<string>;
  /** Cluster endpoint URL */
  endpoint: pulumi.Output<string>;
  /** Provider-specific cluster ID */
  clusterId: pulumi.Output<string>;
}

/**
 * Instance size mapping per cloud provider
 */
export const instanceSizeMapping: Record<CloudProvider, Record<NodePoolConfig["instanceSize"], string>> = {
  aws: {
    small: "t3.small",
    medium: "t3.medium",
    large: "t3.large",
    xlarge: "t3.xlarge",
  },
  gcp: {
    small: "e2-small",
    medium: "e2-medium",
    large: "e2-standard-2",
    xlarge: "e2-standard-4",
  },
  azure: {
    small:  "Standard_B2s_v2",
    medium: "Standard_B4s_v2",
    large:  "Standard_D2s_v3",
    xlarge: "Standard_D4s_v3",
  },
};


import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as eks from "@pulumi/eks";
import { ClusterConfig, ClusterOutput, instanceSizeMapping } from "../../types";

/**
 * Creates an AWS EKS cluster with VPC and node groups
 */
export function createEksCluster(config: ClusterConfig): ClusterOutput {
  const tags = config.tags;

  // Get available AZs
  const availabilityZones = aws.getAvailabilityZones({
    state: "available",
  });

  // Create VPC
  const vpc = new aws.ec2.Vpc("vpc", {
    cidrBlock: config.network.vpcCidr,
    enableDnsHostnames: true,
    enableDnsSupport: true,
    tags: {
      ...tags,
      Name: `${config.clusterName}-vpc`,
    },
  });

  // Create Internet Gateway
  const igw = new aws.ec2.InternetGateway("igw", {
    vpcId: vpc.id,
    tags: {
      ...tags,
      Name: `${config.clusterName}-igw`,
    },
  });

  // Create public subnets
  const publicSubnets: aws.ec2.Subnet[] = [];
  config.network.publicSubnetCidrs?.forEach((cidr, index) => {
    const subnet = new aws.ec2.Subnet(`public-subnet-${index}`, {
      vpcId: vpc.id,
      cidrBlock: cidr,
      availabilityZone: availabilityZones.then(azs => azs.names[index % azs.names.length]),
      mapPublicIpOnLaunch: true,
      tags: {
        ...tags,
        Name: `${config.clusterName}-public-${index}`,
        "kubernetes.io/role/elb": "1",
        [`kubernetes.io/cluster/${config.clusterName}`]: "shared",
      },
    });
    publicSubnets.push(subnet);
  });

  // Create private subnets
  const privateSubnets: aws.ec2.Subnet[] = [];
  config.network.privateSubnetCidrs.forEach((cidr, index) => {
    const subnet = new aws.ec2.Subnet(`private-subnet-${index}`, {
      vpcId: vpc.id,
      cidrBlock: cidr,
      availabilityZone: availabilityZones.then(azs => azs.names[index % azs.names.length]),
      tags: {
        ...tags,
        Name: `${config.clusterName}-private-${index}`,
        "kubernetes.io/role/internal-elb": "1",
        [`kubernetes.io/cluster/${config.clusterName}`]: "shared",
      },
    });
    privateSubnets.push(subnet);
  });

  // Create NAT Gateway (one per AZ for high availability in production)
  const eip = new aws.ec2.Eip("nat-eip", {
    domain: "vpc",
    tags: {
      ...tags,
      Name: `${config.clusterName}-nat-eip`,
    },
  });

  const natGateway = new aws.ec2.NatGateway("nat-gateway", {
    allocationId: eip.id,
    subnetId: publicSubnets[0].id,
    tags: {
      ...tags,
      Name: `${config.clusterName}-nat`,
    },
  }, { dependsOn: [igw] });

  // Create route tables
  const publicRouteTable = new aws.ec2.RouteTable("public-rt", {
    vpcId: vpc.id,
    routes: [
      {
        cidrBlock: "0.0.0.0/0",
        gatewayId: igw.id,
      },
    ],
    tags: {
      ...tags,
      Name: `${config.clusterName}-public-rt`,
    },
  });

  const privateRouteTable = new aws.ec2.RouteTable("private-rt", {
    vpcId: vpc.id,
    routes: [
      {
        cidrBlock: "0.0.0.0/0",
        natGatewayId: natGateway.id,
      },
    ],
    tags: {
      ...tags,
      Name: `${config.clusterName}-private-rt`,
    },
  });

  // Associate route tables with subnets
  publicSubnets.forEach((subnet, index) => {
    new aws.ec2.RouteTableAssociation(`public-rta-${index}`, {
      subnetId: subnet.id,
      routeTableId: publicRouteTable.id,
    });
  });

  privateSubnets.forEach((subnet, index) => {
    new aws.ec2.RouteTableAssociation(`private-rta-${index}`, {
      subnetId: subnet.id,
      routeTableId: privateRouteTable.id,
    });
  });

  // Create EKS cluster using the eks package
  // Use privateSubnetIds + publicSubnetIds (mutually exclusive with subnetIds)
  const cluster = new eks.Cluster(config.clusterName, {
    name: config.clusterName,
    version: config.kubernetesVersion,
    vpcId: vpc.id,
    privateSubnetIds: privateSubnets.map(s => s.id),
    publicSubnetIds: publicSubnets.map(s => s.id),
    instanceType: instanceSizeMapping.aws[config.nodePools[0].instanceSize],
    desiredCapacity: config.nodePools[0].desiredSize,
    minSize: config.nodePools[0].minSize,
    maxSize: config.nodePools[0].maxSize,
    nodeRootVolumeSize: config.nodePools[0].diskSizeGb,
    endpointPrivateAccess: config.aws?.privateCluster ?? false,
    endpointPublicAccess: true,
    tags: tags,
  });

  // Create additional node groups if specified
  config.nodePools.slice(1).forEach((nodePool, index) => {
    new eks.ManagedNodeGroup(`nodegroup-${nodePool.name}`, {
      cluster: cluster,
      nodeGroupName: nodePool.name,
      instanceTypes: [instanceSizeMapping.aws[nodePool.instanceSize]],
      scalingConfig: {
        desiredSize: nodePool.desiredSize,
        minSize: nodePool.minSize,
        maxSize: nodePool.maxSize,
      },
      diskSize: nodePool.diskSizeGb,
      labels: nodePool.labels,
      taints: nodePool.taints?.map(t => ({
        key: t.key,
        value: t.value,
        effect: t.effect.toUpperCase().replace("NOSCHEDULE", "NO_SCHEDULE").replace("NOEXECUTE", "NO_EXECUTE") as any,
      })),
      tags: tags,
    });
  });

  return {
    clusterName: pulumi.output(config.clusterName),
    kubeconfig: cluster.kubeconfig.apply(JSON.stringify),
    endpoint: cluster.eksCluster.endpoint,
    clusterId: cluster.eksCluster.id,
  };
}

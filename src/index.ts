import * as pulumi from "@pulumi/pulumi";
import { loadConfig } from "./config";
import { createEksCluster, createGkeCluster, createAksCluster } from "./providers";
import { ClusterOutput } from "./types";

/**
 * Cloud-Agnostic Kubernetes Cluster Deployment
 * 
 * This Pulumi program deploys a managed Kubernetes cluster to one of:
 *   - AWS (EKS)
 *   - GCP (GKE)  
 *   - Azure (AKS)
 * 
 * Usage:
 *   pulumi config set cloudProvider aws|gcp|azure
 *   pulumi config set environment dev|staging|prod
 *   pulumi config set region <cloud-region>
 *   pulumi up
 */

// Load configuration
const config = loadConfig();

// Deploy cluster based on provider
let cluster: ClusterOutput;

switch (config.provider) {
  case "aws":
    cluster = createEksCluster(config);
    break;
  case "gcp":
    cluster = createGkeCluster(config);
    break;
  case "azure":
    cluster = createAksCluster(config);
    break;
  default:
    throw new Error(`Unknown cloud provider: ${config.provider}`);
}

// Export cluster outputs
export const clusterName = cluster.clusterName;
export const kubeconfig = pulumi.secret(cluster.kubeconfig);
export const clusterEndpoint = cluster.endpoint;
export const clusterId = cluster.clusterId;
export const cloudProvider = config.provider;
export const environment = pulumi.output(config.tags.Environment);


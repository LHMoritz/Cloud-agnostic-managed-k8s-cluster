#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./scripts/setup-kubeconfig.sh <stack-name>
# Example:
#   ./scripts/setup-kubeconfig.sh dev-aks-test

STACK="${1:-dev}"
TEMP_KUBECONFIG="/tmp/pulumi-kubeconfig-$STACK.yaml"

echo "📦 Fetching stack outputs..."
STACK_OUTPUTS=$(pulumi stack output --json)
CLOUD_PROVIDER=$(echo "$STACK_OUTPUTS" | jq -r '.cloudProvider // empty')

if [ "$CLOUD_PROVIDER" == "azure" ]; then
  echo "☁️  Detected Azure cluster. Using 'az aks get-credentials' for AAD support."
  
  CLUSTER_NAME=$(echo "$STACK_OUTPUTS" | jq -r '.clusterName')
  CLUSTER_ID=$(echo "$STACK_OUTPUTS" | jq -r '.clusterId')
  # Extract Resource Group name from the Cluster ID
  # ID format: /subscriptions/<sub-id>/resourcegroups/<rg-name>/providers/Microsoft.ContainerService/managedClusters/<cluster-name>
  RESOURCE_GROUP=$(echo "$CLUSTER_ID" | sed -E 's/.*resourcegroups\/([^\/]*)\/.*/\1/I')

  echo "   Cluster: $CLUSTER_NAME"
  echo "   Resource Group: $RESOURCE_GROUP"

  # Use az aks get-credentials to generate a fresh kubeconfig with correct AAD settings
  az aks get-credentials --resource-group "$RESOURCE_GROUP" --name "$CLUSTER_NAME" --file "$TEMP_KUBECONFIG" --overwrite-existing
  
  # Check if kubelogin is installed (often needed for AAD non-interactive login)
  if ! command -v kubelogin &> /dev/null; then
    echo "⚠️  Warning: 'kubelogin' is not found. You may need it for Azure AAD authentication."
    echo "   Install it with: az aks install-cli or brew install Azure/kubelogin/kubelogin"
  fi
else
  echo "☁️  Detected provider: ${CLOUD_PROVIDER:-unknown}. Using Pulumi kubeconfig output."
  echo "$STACK_OUTPUTS" | jq -r '.kubeconfig' > "$TEMP_KUBECONFIG"
fi

# Create ~/.kube directory if it doesn't exist
mkdir -p ~/.kube

# Backup existing config if it exists
if [ -f ~/.kube/config ]; then
  echo "💾 Backing up existing kubeconfig to ~/.kube/config.backup-$(date +%s)"
  cp ~/.kube/config ~/.kube/config.backup-$(date +%s)
fi

# Get cluster context name from the temp kubeconfig
CONTEXT_NAME=$(kubectl --kubeconfig="$TEMP_KUBECONFIG" config current-context)

# Delete existing context/cluster/user if they exist (to force update with new endpoint)
if [ -f ~/.kube/config ]; then
  echo "🧹 Removing old context if it exists: $CONTEXT_NAME"
  kubectl config delete-context "$CONTEXT_NAME" 2>/dev/null || true
  kubectl config delete-cluster "$CONTEXT_NAME" 2>/dev/null || true
  kubectl config delete-user "$CONTEXT_NAME" 2>/dev/null || true
fi

# Merge kubeconfig into ~/.kube/config using KUBECONFIG environment variable
echo "🔗 Merging kubeconfig into ~/.kube/config"
if [ -f ~/.kube/config ]; then
  # Use KUBECONFIG to merge, then flatten and write back
  export KUBECONFIG="$HOME/.kube/config:$TEMP_KUBECONFIG"
  kubectl config view --flatten > ~/.kube/config.tmp
  mv ~/.kube/config.tmp ~/.kube/config
  unset KUBECONFIG
else
  cp "$TEMP_KUBECONFIG" ~/.kube/config
fi

# Switch to the new context
echo "🔄 Switching to context: $CONTEXT_NAME"
kubectl config use-context "$CONTEXT_NAME"

# Cleanup
rm "$TEMP_KUBECONFIG"

echo ""
echo "✅ Done! Test connection:"
echo "  kubectl get nodes"
echo ""
echo "Switch context later:"
echo "  kubectl config use-context $CONTEXT_NAME"
echo ""
echo "View all contexts:"
echo "  kubectl config get-contexts"

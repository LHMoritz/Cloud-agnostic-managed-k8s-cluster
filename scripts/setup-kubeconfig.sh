#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./scripts/setup-kubeconfig.sh <stack-name>
# Example:
#   ./scripts/setup-kubeconfig.sh dev-aks-test

STACK="${1:-dev}"
TEMP_KUBECONFIG="/tmp/pulumi-kubeconfig-$STACK.yaml"

echo "📦 Fetching kubeconfig from Pulumi stack: $STACK"
pulumi stack select "$STACK"
pulumi stack output kubeconfig --show-secrets > "$TEMP_KUBECONFIG"

# Create ~/.kube directory if it doesn't exist
mkdir -p ~/.kube

# Backup existing config if it exists
if [ -f ~/.kube/config ]; then
  echo "💾 Backing up existing kubeconfig to ~/.kube/config.backup-$(date +%s)"
  cp ~/.kube/config ~/.kube/config.backup-$(date +%s)
fi

# Merge kubeconfig into ~/.kube/config
echo "🔗 Merging kubeconfig into ~/.kube/config"
if [ -f ~/.kube/config ]; then
  KUBECONFIG=~/.kube/config:$TEMP_KUBECONFIG kubectl config view --flatten > ~/.kube/config.tmp
  mv ~/.kube/config.tmp ~/.kube/config
else
  cp "$TEMP_KUBECONFIG" ~/.kube/config
fi

# Get cluster context name from the temp kubeconfig
CONTEXT_NAME=$(kubectl --kubeconfig="$TEMP_KUBECONFIG" config current-context)

# Switch to the new context
echo "🔄 Switching to context: $CONTEXT_NAME"
kubectl config use-context "$CONTEXT_NAME"

# Cleanup
rm "$TEMP_KUBECONFIG"

echo "Test connection:"
echo "  kubectl get nodes"
echo ""
echo "Switch context later:"
echo "  kubectl config use-context $CONTEXT_NAME"
echo ""
echo "View all contexts:"
echo "  kubectl config get-contexts"

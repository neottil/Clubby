#!/bin/bash
# ============================================================
# Setup k3s + Traefik + cert-manager (Let's Encrypt) su VPS
#
# Da eseguire UNA VOLTA sulla VPS di produzione, come root (o con sudo -E).
# k3s include già Traefik come Ingress Controller di default: non va
# installato separatamente. Questo script installa in aggiunta cert-manager
# e configura due ClusterIssuer Let's Encrypt (staging + produzione) che
# risolvono la challenge HTTP-01 tramite Traefik — coerente con l'annotazione
# `cert-manager.io/cluster-issuer: letsencrypt` già presente in
# k8s/templates/ingress.yaml.
#
# Idempotente: può essere rieseguito senza effetti collaterali (salta
# l'installazione di k3s se già presente, il resto usa `kubectl apply`).
#
# Uso:
#   LETSENCRYPT_EMAIL=admin@tuodominio.com [DEPLOY_USER=deploy] \
#     sudo -E bash scripts/setup-vps-k3s.sh
#
# Variabili:
#   LETSENCRYPT_EMAIL   (obbligatoria) email di contatto per Let's Encrypt
#   DEPLOY_USER         (default: utente che ha lanciato sudo, o root)
#                        utente SSH usato dalla pipeline per kubectl (SSH_USER)
#   CERT_MANAGER_VERSION (default: v1.21.0)
# ============================================================
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Esegui questo script come root (o con sudo -E)." >&2
  exit 1
fi

LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:?Imposta LETSENCRYPT_EMAIL, es: LETSENCRYPT_EMAIL=admin@tuodominio.com sudo -E bash scripts/setup-vps-k3s.sh}"
DEPLOY_USER="${DEPLOY_USER:-${SUDO_USER:-root}}"
CERT_MANAGER_VERSION="${CERT_MANAGER_VERSION:-v1.21.0}"

echo "=== 1/6: Installazione k3s (Traefik incluso di default) ==="
if command -v k3s >/dev/null 2>&1; then
  echo "k3s già installato, salto."
else
  curl -sfL https://get.k3s.io | sh -
fi

export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

echo "=== 2/6: Attendo che il nodo sia Ready ==="
for i in $(seq 1 60); do
  if k3s kubectl get nodes 2>/dev/null | grep -q " Ready"; then
    echo "Nodo pronto."
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "ERRORE: il nodo k3s non è diventato Ready in tempo." >&2
    exit 1
  fi
  sleep 5
done

# kubectl è già impacchettato in k3s: usa il symlink creato dall'installer
# se presente, altrimenti creane uno (necessario perché la pipeline CI/CD
# esegue "kubectl apply/rollout status" via SSH come comando semplice).
command -v kubectl >/dev/null 2>&1 || ln -s /usr/local/bin/k3s /usr/local/bin/kubectl

echo "=== 3/6: Configuro kubectl per l'utente $DEPLOY_USER ==="
DEPLOY_HOME=$(getent passwd "$DEPLOY_USER" | cut -d: -f6)
mkdir -p "$DEPLOY_HOME/.kube"
cp /etc/rancher/k3s/k3s.yaml "$DEPLOY_HOME/.kube/config"
chown -R "$DEPLOY_USER":"$DEPLOY_USER" "$DEPLOY_HOME/.kube"
chmod 600 "$DEPLOY_HOME/.kube/config"
# ~/.kube/config è il percorso di default di kubectl: non serve impostare
# KUBECONFIG per l'utente di deploy, nemmeno in sessioni SSH non interattive.

echo "=== 4/6: Installazione cert-manager $CERT_MANAGER_VERSION ==="
kubectl apply -f "https://github.com/cert-manager/cert-manager/releases/download/${CERT_MANAGER_VERSION}/cert-manager.yaml"

echo "Attendo che cert-manager sia pronto..."
kubectl wait --for=condition=Available --timeout=180s -n cert-manager deployment/cert-manager
kubectl wait --for=condition=Available --timeout=180s -n cert-manager deployment/cert-manager-webhook
kubectl wait --for=condition=Available --timeout=180s -n cert-manager deployment/cert-manager-cainjector

echo "=== 5/6: Creo i ClusterIssuer Let's Encrypt (HTTP-01 via Traefik) ==="
cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-staging
spec:
  acme:
    email: ${LETSENCRYPT_EMAIL}
    server: https://acme-staging-v02.api.letsencrypt.org/directory
    privateKeySecretRef:
      name: letsencrypt-staging-account-key
    solvers:
      - http01:
          ingress:
            ingressClassName: traefik
---
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt
spec:
  acme:
    email: ${LETSENCRYPT_EMAIL}
    server: https://acme-v02.api.letsencrypt.org/directory
    privateKeySecretRef:
      name: letsencrypt-account-key
    solvers:
      - http01:
          ingress:
            ingressClassName: traefik
EOF

# /opt è tipicamente root:root (755): senza questo passo l'utente di deploy
# non ha i permessi per creare le sottocartelle dove le pipeline Infra/Build &
# Deploy copiano i manifest via scp (/opt/clubby/<ambiente>/k8s e
# /opt/clubby/<ambiente>/infra, una cartella per ambiente — vedi
# .github/actions/ambiente), causando un errore "Process exited with status 1"
# nello step scp-action.
echo "=== 6/6: Preparo /opt/clubby per l'utente $DEPLOY_USER ==="
mkdir -p /opt/clubby
chown -R "$DEPLOY_USER":"$DEPLOY_USER" /opt/clubby

echo ""
echo "=== Fatto ==="
echo ""
echo "  kubectl configurato per l'utente: $DEPLOY_USER (~/.kube/config)"
echo "  Ingress Controller               : Traefik (già incluso in k3s, ingressClassName: traefik)"
echo "  ClusterIssuer 'letsencrypt-staging': per test, nessun rate limit reale"
echo "  ClusterIssuer 'letsencrypt'        : produzione, usato da k8s/templates/ingress.yaml"
echo "  /opt/clubby                   : creata, di proprietà di $DEPLOY_USER"
echo ""
echo "  I certificati emessi da cert-manager si rinnovano AUTOMATICAMENTE, nessuna"
echo "  azione manuale richiesta (vedi README, sezione K8s, per i dettagli)."
echo ""

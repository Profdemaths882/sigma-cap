# Sigma Cap sur votre propre serveur

1. Chez votre fournisseur de domaine, créez un enregistrement **A** : `sigmacap` → adresse IP du serveur.
2. Connectez-vous au serveur en SSH (`ssh root@IP`) et lancez :
   `curl -fsSL https://raw.githubusercontent.com/Profdemaths882/sigma-cap/main/server/install.sh | bash -s sigmacap.racineprofdemaths.com`
3. Copiez les données depuis Google (une seule fois) :
   `sudo -u sigma node /opt/sigma-cap/server/import.js && systemctl restart sigma-cap`

Données : `/var/lib/sigma-cap` · sauvegardes chaque nuit : `/var/backups/sigma-cap` · mises à jour du site automatiques toutes les 10 minutes.

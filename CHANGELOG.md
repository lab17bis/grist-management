# Journal des modifications

Les adresses `/v1/` ne changent pas : chaque version ajoute ou corrige, sans retirer ce qui existe.

## 2026-11-27 (barre commune de l'éditeur)
- Barre commune à tous les widgets (fichier partagé `commun/barre.js` et `commun/barre.css`) : nom du widget et statut à gauche, onglets Réglages, En-tête et pied, Aperçu, Publication au centre, Enregistrer à droite ; barre collante en haut de l'écran.
- L'outil n'a plus d'onglet à son nom : il s'utilise dans l'Aperçu, ouvert par défaut, avec l'en-tête et le pied de page (affichés une seule fois). Les rubriques propres à l'outil sont des sous-onglets de Réglages quand il y en a plusieurs.
- Liens et boutons « Réglages » ou « Configurer » de l'outil masqués : la barre suffit.
- Même lien, deux affichages : chaque vue Grist choisit, dans Publication, l'éditeur du widget ou la page d'usage (l'outil avec son en-tête et son pied, sans barre, avec un lien « Éditer le widget »). Le choix est une option de la vue Grist ; par défaut, l'éditeur s'affiche comme avant.
- Affichage de la vue : après « Appliquer à cette vue », un texte rappelle de cliquer sur Enregistrer en haut de la vue Grist pour garder le choix (vérifié dans Grist).

## 2026-11-27 (adresse refusée)
- Publication : une adresse de page contenant l'identifiant long du document est refusée avec un message qui explique quoi copier (Grist ignore la page dans ce cas).

## 2026-11-27 (barre stable)
- Barre de réglages : la place du bouton Enregistrer est réservée sur l'onglet de la vue, la barre ne saute plus d'un onglet à l'autre.

## 2026-11-27 (publication réservée)

### Ajouté

- Onglet Publication : section « Lien réservé aux personnes invitées » (collez l'adresse de la page Grist, le lien plein écran se construit, au choix en consultation seule ou avec saisie) et rappel de la différence entre page publique et lien réservé.

## 2026-11-27 (cohérence de la barre de réglages)

### Corrigé

- Le bouton Enregistrer est aligné sur la barre d'onglets, les onglets sont centrés et la pastille « Enregistré / Non enregistré » reste visible sur toutes les pages.

## 2026-11-26 (tables déjà présentes dans le document)

### Corrigé
- Si le document contient déjà une table du même nom que celles de l'outil (`Meteo`, `Signalements`), créée à la main ou par un autre outil, le widget la croyait prête et n'ajoutait pas les colonnes qui lui manquent : les informations ne s'affichaient pas et les enregistrements échouaient, sans message. Le widget signale maintenant les colonnes manquantes et propose « Ajouter les colonnes manquantes ». L'installation complète aussi les tables déjà présentes. Rien n'est renommé ni supprimé.

### Ajouté
- Conseil affiché : si une de vos colonnes contient déjà l'information sous un autre nom, renommez-la dans Grist avec le nom attendu, ses données seront reprises.

## 2026-11-26 (style commun de configuration)

### Corrigé
- Configuration : sur l'onglet de l'outil, le style commun masquait par erreur tout champ dont l'identifiant finit par « -etat » (dans grist-projet : le filtre « État » de la banque et la liste « État » du formulaire de projet). Seul le badge « Enregistré » de la barre est maintenant masqué. Rien à refaire : rechargez la page.

## 2026-11-26 (correctif : tableaux de bord dans la version v1)

### Corrigé
- Adresse `/v1/` : les modules de grist-graphique (tableaux de bord, graphiques) ne se chargeaient plus (chemin doublé `grist-graphique/v1/v1/`, erreur 404). Le bloc « Tableau de bord » affichait « Les modules de grist-graphique n'ont pas pu être chargés ». Rien à refaire dans vos documents : rechargez la page.
- Script de version (`outils/figer-version.sh`) : relancé plusieurs fois, il ne double plus le chemin.

## 2026-11-25 (mention de conception)

### Ajouté
- Mention discrète en pied de page, sur l'outil comme sur ses pages publiques : « Widget conçu par le Lab 17 bis, le laboratoire d'innovation publique de l'académie de Reims ».

## 2026-11-25 (aperçu réel)

### Amélioré
- Onglet « Aperçu » de la configuration : il montre maintenant l'outil de management visuel elle-même, entre l'en-tête et le pied de page, au lieu d'un exemple fixe. Les réglages en cours de saisie, même non enregistrés, s'appliquent le temps de l'aperçu ; en quittant l'onglet, l'outil revient à ses réglages enregistrés.
- Dans l'aperçu, l'outil est réellement actif : ce que vous y faites s'applique au document. Un message le rappelle.

## 2026-11-25 (audit de sécurité)

### Sécurité
- Les liens venant des données ou des réglages sont vérifiés par le navigateur lui-même : une adresse déguisée (« java⇥script: » avec tabulation, retour à la ligne ou caractère de contrôle) n'est plus acceptée. Elle permettait, sur le portail, d'exécuter du script au clic depuis une adresse fabriquée.
- Politique de sécurité de contenu stricte : seuls les scripts du site, l'API Grist et les scripts de la page connus par leur empreinte peuvent s'exécuter. L'évaluation de texte (« unsafe-eval ») reste permise : l'API officielle de Grist en a besoin (sans elle, les widgets restaient bloqués sur « Chargement… » dans Grist le 25/11 au matin). Un script injecté (lien javascript:, attribut onerror…) est bloqué même si un filtre le laissait passer.
- Page publique : message clair si le document Grist est injoignable (au lieu de « Failed to fetch »).

## 2026-11-24 (durcissement)

### Sécurité
- Les pages ajoutent une politique de sécurité de contenu minimale (pas d'objets embarqués, pas de balise base).
- Les pages publiques n'acceptent plus qu'un lien de document Grist en https (http seulement pour localhost, en développement).

## 2026-11-24 (message de lecture publique)

### Corrigé
- Page publique : quand une table est masquée par les règles d'accès du document, le message nomme la table et explique la cause (erreur 403), au lieu de demander si le document est partagé. Comportement vérifié sur un vrai document Grist : une table refusée au public répond 403, une colonne refusée disparaît des lignes, les personnes connectées gardent leurs droits.

## 2026-11-24 (règles d'accès)

### Corrigé
- Page publique : une table ou une colonne masquée par les règles d'accès du document (par exemple les adresses de courriel) n'empêche plus d'afficher le reste de la page.

### Ajouté
- Documentation de la page publique (README) : réglages, ce qui est lu, ce qui reste caché, règles d'accès à poser.

## 2026-11-24 (page publique)

### Ajouté
- Page publique en lecture seule : les écrans du management visuel (synthèse, météo, signalements, actions, réunion, projets, tableaux), sans saisie. L'adresse `index.html?public=1&doc=<lien du document Grist>&table=Meteo` l'affiche sans compte Grist.
- Module commun `commun/grist-public.js` (et `.css`) : lit le document par l'API REST de Grist, en lecture seule, sans compte.
- Onglet Publication : saisissez le lien du document Grist partagé en lecture publique, l'outil construit le lien de la page publique, à copier ou à ouvrir ; le lien est enregistré avec les réglages.
- Option `integre=1` : page sans en-tête ni pied propres, pour l'intégrer dans un autre site.

## 2026-11-24 (documentation)

### Modifié
- Documentation : l'outil de consultation s'appelle désormais `grist-consultation` (ancien nom `grist-decision`).

## 2026-11-24 (barre d'onglets permanente)

### Modifié
- Le widget s'ouvre désormais sur une barre d'onglets, comme le catalogue et le questionnaire : *Management visuel*, puis les onglets de réglages, En-tête et pied, Aperçu, Publication. L'outil lui-même est le premier onglet.
- Le bouton « Configurer » laisse la place à la barre d'onglets ; les anciens liens et boutons « Réglages » restent actifs et ouvrent l'onglet Réglages.
- L'enregistrement des réglages reste dans la colonne de configuration existante : rien à migrer.

## 2026-11-24

### Ajouté
- Bouton « Configurer » en haut de l'outil : ouvre une page de configuration unique en quatre onglets (Réglages, En-tête et pied, Aperçu, Publication). L'ancien lien « Réglages de l'espace » en bas de page reste actif.
- Module commun `commun/configuration.js` et `commun/configuration.css`, partagé avec les autres widgets de la famille.
- Onglet Aperçu : l'en-tête et le pied de page tels qu'ils seront affichés, avec les réglages en cours, même non enregistrés.
- Onglet Publication : explique que l'outil est réservé aux personnes connectées, comment inviter l'équipe, et donne l'adresse du widget à copier.

### Modifié
- Les réglages existants (écrans, zones, rubriques, escalade, délais, en-tête et pied) sont conservés tels quels, dans la colonne `Config_management`.
- Modifier la liste des écrans ou des zones garde l'onglet ouvert et marque les modifications comme non enregistrées.
- En mode démonstration, la page de configuration est visible mais n'enregistre rien.

## Versions antérieures

Voir l'historique des commits.

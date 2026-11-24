# grist-management

> **Widget-outil pour Grist, clé en main.** Il ajoute à un document Grist un écran de management visuel d'équipe, au Système de design de l'État (DSFR) : météo du jour, signalements de problèmes avec escalade, actions à suivre, prochaine réunion, projets par phase et tableaux de bord, sur un écran de service qui défile tout seul.

Cet outil **assemble** les autres outils de la famille au lieu de les refaire. Il ne redessine ni graphiques, ni réunions, ni projets : il affiche ce que produisent [grist-graphique](https://github.com/lab17bis/grist-graphique), [grist-reunion](https://github.com/lab17bis/grist-reunion) et [grist-projet](https://github.com/lab17bis/grist-projet) quand leurs tables sont dans le même document. Il ajoute seulement ce qui leur manquait pour le management visuel.

Tout se règle dans Grist, sans toucher au code. Le dépôt ne contient que le code : aucune donnée réelle.

Démonstration avec des données fictives (rien n'est enregistré) : <https://lab17bis.github.io/grist-management/v1/>

## À quoi ça sert

Le management visuel rend visibles, pour toute l'équipe et au même endroit, l'état du jour, les problèmes et les engagements. Le point d'équipe quotidien se tient devant l'écran.

| Zone | Ce qu'elle montre | D'où viennent les données |
| --- | --- | --- |
| **Chiffres clés** | Rubriques en critique, signalements ouverts et hors délai, actions en retard, prochaine réunion | Toutes les sources présentes |
| **Météo du jour** | Une grille rubriques × jours : conforme, à surveiller, critique, avec le commentaire. L'équipe la renseigne chaque jour | Table `Meteo` (créée par l'outil) |
| **Signalements** | Les problèmes ouverts, du plus grave au plus ancien, le délai de résolution, l'escalade (équipe, encadrement, direction). On signale, on prend en charge, on escalade, on résout | Table `Signalements` (créée par l'outil) |
| **Actions à suivre** | Les actions ouvertes en retard, dans les 7 jours, plus tard. On change leur état depuis l'écran | grist-reunion (`Actions_reunion`) et grist-projet (`Actions`) |
| **Prochaine réunion** | Date, lieu et ordre du jour minuté, propositions en attente | grist-reunion (`Reunions`, `Points`) |
| **Projets par phase** | Un kanban des projets en cours, avec les projets bloqués ou en pause signalés | grist-projet (`Projets`) |
| **Tableau de bord** | Un tableau de bord complet, avec ses seuils vert/orange/rouge | grist-graphique (colonne `Config_graphique`) |
| **Message libre** | Une consigne, une information du jour | Réglages |

Les statuts ne reposent jamais sur la couleur seule : chaque case porte un symbole (✓, !, ✕) et un texte pour les lecteurs d'écran.

**Mode affichage** : plein écran, texte agrandi, commandes de saisie masquées, rotation automatique des écrans, actualisation toutes les minutes. Échap pour en sortir. Pour un écran de service, ouvrez le document Grist sur l'ordinateur relié, agrandissez le widget, puis lancez le mode affichage.

## Le brancher en 3 minutes

1. **Ouvrir le document Grist de l'équipe**, de préférence celui qui contient déjà les tables de grist-reunion, grist-projet ou un tableau de bord grist-graphique. Un document vide convient aussi.
2. **Ajouter le widget** : *Ajouter › Ajouter une page › Personnalisé*, sur n'importe quelle table. Choisissez *URL personnalisée*, saisissez `https://lab17bis.github.io/grist-management/v1/` et donnez l'**accès complet au document**.
3. **Installer** : le widget propose *Créer les tables* (`Meteo` et `Signalements`), ou *avec un exemple fictif* pour essayer. Les tables existantes ne sont pas modifiées. À faire par un propriétaire du document.

Les écrans se composent alors automatiquement selon ce que contient le document. Pour ajouter un outil plus tard, il suffit d'installer son widget dans le même document : grist-reunion crée lui aussi ses tables.

## Le régler

Le widget s'ouvre sur une barre d'onglets : *Management visuel* (l'outil), puis *Réglages*, *En-tête et pied*, *Aperçu* (le rendu avec les réglages en cours) et *Publication* (qui peut utiliser l'outil, adresse du widget). Le lien *Réglages de l'espace*, en bas du widget, y mène aussi. L'onglet *Réglages* contient :

| Rubrique | Ce qu'on y règle |
| --- | --- |
| Écrans | Les écrans et leurs zones (type, largeur, titre, options : instance de réunion, source des actions, tableau de bord affiché, message) |
| Météo et signalements | Rubriques (par défaut : santé et sécurité, qualité de service, délais, moyens, équipe), niveaux d'escalade, nombre de jours affichés, délai de résolution, durée de rotation, week-ends |
| En-tête et pied de page | Comme pour les autres outils de la famille |

Les réglages sont enregistrés en JSON dans la **description de la colonne `Config_management`** de la table `Meteo`.

## Modèle de données

| Table | Colonnes |
| --- | --- |
| `Meteo` | `Date`, `Rubrique` (choix), `Statut` (Conforme, À surveiller, Critique), `Commentaire`, `Saisi_par` (rempli par Grist), `Config_management` |
| `Signalements` | `Titre`, `Description`, `Rubrique` (choix), `Gravite` (Bloquante, Majeure, Mineure), `Statut` (Ouvert, En cours, Résolu), `Escalade` (choix), `Responsable`, `Resolution`, `Signale_par` et `Signale_le` (remplis par Grist), `Resolu_le` |

Les valeurs de `Statut` et de `Gravite` sont utilisées par le code : ne les renommez pas.

Pour signaler un problème sans être connecté au document, branchez [grist-questionnaire](https://github.com/lab17bis/grist-questionnaire) sur la table `Signalements`.

## Le reprendre et l'adapter

- **L'utiliser tel quel** : ajoutez le widget dans Grist.
- **L'héberger chez vous** : le widget charge les modules de grist-graphique depuis le dossier voisin (`../grist-graphique/` pour la version en cours, `../../grist-graphique/v1/` pour la version stable). Hébergez les deux dépôts côte à côte, comme sur `lab17bis.github.io`, ou changez ces adresses dans `index.html`.

| Dossier ou fichier | Rôle |
| --- | --- |
| `v1/` | Version stable figée, servie à l'adresse `…/v1/`. Ne pas modifier à la main. |
| `outils/figer-version.sh` | Copie la version en cours dans `vN/`. |
| `index.html`, `js/app.js`, `css/app.css` | L'application : zones, écrans, mode affichage, installation, réglages |
| `commun/` | En-tête et pied de page configurables, communs aux outils `grist-*` |
| `exemples/demo.json` | Jeu d'exemple inventé (dates relatives, « J-3 ») |
| `tests/` | Tests de l'interface : `python3 tests/test_management.py` (Playwright) |
| `vendor/dsfr/` | DSFR 1.15.4, embarqué |

## Fonctionnement et sécurité

- Le widget lit et écrit avec les droits de la personne connectée et ne contourne aucune règle d'accès. Il n'affiche que ce que Grist lui transmet.
- Rien n'est publié hors de Grist : l'écran de service affiche le document ouvert dans Grist.
- Le dépôt ne contient jamais de données réelles, de clé, d'adresse de document Grist ni de nom réel.

## Limites

- Fonctionne uniquement dans Grist. Le plein écran peut être refusé par le navigateur à l'intérieur de Grist : utilisez alors le plein écran du navigateur (F11).
- Les responsables d'actions de grist-reunion sont des textes libres, ceux de grist-projet des personnes de l'annuaire : l'outil les affiche tels quels.
- Aucun audit RGAA n'a été mené.

## Version stable et version en cours

Dans Grist, utilisez l'adresse de la **version stable** : `https://lab17bis.github.io/grist-management/v1/`. Elle ne change que pour corriger un défaut, sans toucher aux tables ni aux réglages. Une évolution qui les modifie paraît sous une nouvelle adresse (`v2/`) : les documents déjà en service restent sur `v1/` tant que vous ne changez pas l'adresse du widget.

L'adresse sans numéro (`https://lab17bis.github.io/grist-management/`) suit la version en cours de développement. Elle sert à essayer les nouveautés ; ne l'utilisez pas pour un document en service.

Pour figer une nouvelle version stable après des tests réussis : `sh outils/figer-version.sh 1` (ou `2` pour une version qui change les tables), puis publiez le dépôt.

## Données partagées avec les autres outils

Plusieurs outils de la même famille peuvent travailler dans un même document Grist. Ils suivent une règle commune pour ne pas dupliquer les données :

- **Une seule table `Personnes`** par document. Colonne commune : `Nom`. Colonnes facultatives reconnues par tous : `Email` et `Structure` (référence à `Structures`). Un outil lit cette table si elle existe et la crée seulement si elle manque. Il n'y ajoute que ses propres colonnes.
- **Une seule table `Structures`** pour les équipes, services ou établissements : `Nom`, `Sigle`, `Type`, `Parent` (structure de rattachement).
- **Aucun outil ne supprime ni ne renomme** une table ou une colonne qu'il n'a pas créée.
- **Les autres tables portent des noms propres à chaque outil**, pour éviter les collisions (par exemple `Actions` pour grist-projet, `Actions_reunion` pour grist-reunion). Les réglages sont rangés dans la description d'une colonne technique propre à l'outil (`Config_…`).
- **Identifier la personne connectée** : un widget ne connaît pas l'adresse de la personne connectée. Les colonnes « créé par » utilisent une formule `user.Email` calculée à la création. Seul un outil qui doit relier la personne connectée à sa fiche crée la table `Comptes`.

Ce que fait cet outil : Il ne crée pas de table de personnes. Il lit `Personnes` pour afficher les responsables des actions de projet.

## Espaces clés en main

Ce widget est déjà assemblé, avec d'autres, dans des **espaces** : des documents Grist complets à importer en une fois, vides ou avec un exemple fictif.

- [espace-pilotage](https://github.com/lab17bis/espace-pilotage) : piloter une équipe : management visuel, réunions, projets et indicateurs.

## Autres outils de la même famille

- [grist-questionnaire](https://github.com/lab17bis/grist-questionnaire) : questionnaires au DSFR avec logique conditionnelle.
- [grist-catalogue](https://github.com/lab17bis/grist-catalogue) : catalogue public de fiches au DSFR.
- [grist-graphique](https://github.com/lab17bis/grist-graphique) : tableaux de bord et graphiques au DSFR.
- [grist-projet](https://github.com/lab17bis/grist-projet) : espace d'équipe pour gérer des projets.
- [grist-reunion](https://github.com/lab17bis/grist-reunion) : réunions : ordre du jour, séance, compte rendu et suivi des actions.
- [grist-consultation](https://github.com/lab17bis/grist-consultation) : consultations : boîte à idées, valorisation des réalisations, votes et suites données.
- [grist-carte](https://github.com/lab17bis/grist-carte) : carte interactive des lignes d'une table, au fond de l'IGN.
- [grist-graphe](https://github.com/lab17bis/grist-graphe) : cartographie des acteurs et de leurs liens.

Les widgets qui ont un en-tête et un pied de page partagent les mêmes réglages.

## Écosystème

- **[Grist](https://grist.numerique.gouv.fr)** : tableur-base de données libre ([gristlabs/grist-core](https://github.com/gristlabs/grist-core)), proposé aux agents publics par la [DINUM](https://www.numerique.gouv.fr/) dans [La Suite numérique](https://lasuite.numerique.gouv.fr/).
- **[Système de design de l'État (DSFR)](https://www.systeme-de-design.gouv.fr/)** ([GouvernementFR/dsfr](https://github.com/GouvernementFR/dsfr)). Son usage est réservé aux sites des services de l'État.
- **[Apache ECharts](https://echarts.apache.org/)**, via grist-graphique.

## Mots-clés

Grist, widget Grist, widget-outil, management visuel, tableau de management, obeya, SQCDP, point d'équipe quotidien, météo d'équipe, résolution de problèmes, escalade, andon, indicateurs, écran de service, amélioration continue, DSFR, La Suite numérique, DINUM, service public, clé en main, logiciel libre.

## Page publique

Paramètres de l'adresse : `public=1&doc=<lien>&table=Meteo`. La page affiche l'écran de management en lecture ; la saisie et les commandes d'édition sont retirées.

L'onglet **Publication** construit le lien d'une page publique : collez le lien du document Grist partagé en lecture publique (*Partager › Accès public : Lecteur*), puis copiez ou ouvrez le lien obtenu. La page est en lecture seule, sans compte, et n'écrit jamais dans le document. L'option `integre=1` retire l'en-tête et le pied de page pour intégrer la page dans un autre site ou dans le [portail](https://github.com/lab17bis/grist-portail).

Le partage en lecture publique rend lisibles **toutes** les tables du document, pas seulement celles que la page affiche. Pour masquer une table ou une colonne au public, utilisez les règles d'accès de Grist, par exemple avec la condition `not user.IsLoggedIn` (lecture refusée). La page tolère une table masquée. Testez en navigation privée avant de diffuser le lien.

## Licence

Code sous licence MIT (voir `LICENSE`). Le DSFR embarqué dans `vendor/dsfr/` conserve sa propre licence.

Conçu par le Lab 17 bis, laboratoire d'innovation publique de l'académie de Reims. Contact : <lab17bis@ac-reims.fr>

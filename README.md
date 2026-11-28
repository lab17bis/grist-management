# grist-management

> **Widget-outil pour Grist, clé en main.** Il ajoute à un document Grist un écran de management visuel, au Système de design de l'État (DSFR), à deux niveaux : le point d'équipe (priorités et points chauds, signalements, actions, charge de travail vécue, météo facultative) et le point de pilotage entre managers (ce que les équipes escaladent, demandes d'arbitrage, tension de charge), avec la prochaine réunion, les projets par phase et des tableaux de bord, sur un écran de service qui défile tout seul.

Cet outil **assemble** les autres outils de la famille au lieu de les refaire. Il ne redessine ni graphiques, ni réunions, ni projets : il affiche ce que produisent [grist-graphique](https://github.com/lab17bis/grist-graphique), [grist-reunion](https://github.com/lab17bis/grist-reunion) et [grist-projet](https://github.com/lab17bis/grist-projet) quand leurs tables sont dans le même document. Il ajoute seulement ce qui leur manquait pour le management visuel.

Tout se règle dans Grist, sans toucher au code. Le dépôt ne contient que le code : aucune donnée réelle.

Démonstration avec des données fictives (rien n'est enregistré) : <https://lab17bis.github.io/grist-management/v1/>

## À quoi ça sert

Le management visuel rend visibles, pour toute l'équipe et au même endroit, l'état du jour, les problèmes et les engagements. Le point d'équipe quotidien se tient devant l'écran.

| Zone | Ce qu'elle montre | D'où viennent les données |
| --- | --- | --- |
| **Chiffres clés** | Points chauds, rubriques en critique, signalements ouverts et hors délai, actions en retard, prochaine réunion (au pilotage : signalements escaladés, demandes d'arbitrage, équipes en tension critique) | Toutes les sources présentes |
| **Priorités et points chauds** | Ce que le manager publie pour la période : priorités, points chauds en tête, avec une date de fin | Table `Priorites` (créée par l'outil) |
| **Météo du jour** | Facultative. Une grille rubriques × jours : conforme, à surveiller, critique, avec le commentaire | Table `Meteo` (créée par l'outil) |
| **Signalements** | Les problèmes ouverts et les demandes d'arbitrage, du plus grave au plus ancien, le délai de résolution, l'escalade (équipe, encadrement, direction). On signale, on prend en charge, on escalade, on résout | Table `Signalements` (créée par l'outil) |
| **Charge de travail vécue** | Facultative, désactivée par défaut. Chaque agent dit si sa charge est confortable, chargée ou débordante, avec une raison facultative ; l'équipe voit la répartition de la semaine, sans les noms (sauf choix de l'agent) | Table `Charge` (créée à l'activation) |
| **Tension de charge** | Qualifiée chaque semaine par le manager de l'équipe (normale, tendue, critique), avec un commentaire pour le pilotage | Table `Tensions_charge` (créée par l'outil) |
| **Escalades et arbitrages** (pilotage) | Les signalements escaladés au-delà de l'équipe et les demandes d'arbitrage, avec leur équipe | Table `Signalements` |
| **Tension par équipe** (pilotage) | Une grille équipes × semaines de la tension qualifiée par les managers | Table `Tensions_charge` |
| **Actions à suivre** | Les actions ouvertes en retard, dans les 7 jours, plus tard. On change leur état depuis l'écran ; on y note aussi les décisions du point d'équipe | grist-reunion (`Actions_reunion`) et grist-projet (`Actions`) |
| **Prochaine réunion** | Date, lieu et ordre du jour minuté, propositions en attente | grist-reunion (`Reunions`, `Points`) |
| **Projets par phase** | Un kanban des projets en cours, avec les projets bloqués ou en pause signalés | grist-projet (`Projets`) |
| **Tableau de bord** | Un tableau de bord complet, avec ses seuils vert/orange/rouge | grist-graphique (colonne `Config_graphique`) |
| **Message libre** | Une consigne, une information du jour | Réglages |

Les statuts ne reposent jamais sur la couleur seule : chaque case porte un symbole (✓, !, ✕) et un texte pour les lecteurs d'écran.

## Deux niveaux : équipe et pilotage

Un même document sert à toutes les équipes d'une direction (ou d'un service). Les tables ont une colonne `Equipe` ; chaque **vue Personnalisée** du document choisit son niveau et son équipe (*Réglages › Général*, rubrique *Cette vue Grist*), comme elle choisit l'éditeur ou la page d'usage :

- **Niveau Équipe** : le point régulier d'une équipe. Il montre ses priorités et points chauds, ses signalements, ses actions (réunions et projets), sa charge vécue si elle est activée, sa météo si elle est affichée. Une ligne sans équipe vaut pour toutes les équipes (par exemple une priorité de toute la direction).
- **Niveau Pilotage** : le point entre managers. Il ne reçoit que ce que les équipes font remonter : les signalements escaladés au-delà de l'équipe, les demandes d'arbitrage et la tension de charge qualifiée par chaque manager. Il ne lit **jamais** les réponses individuelles des agents sur leur charge (la table n'est même pas lue à ce niveau).

Les décisions prises pendant le point s'enregistrent comme des actions, dans la table `Actions_reunion` partagée avec grist-reunion.

Le niveau d'une vue est un choix d'affichage, pas une protection. Ce que chaque personne peut lire dépend des **règles d'accès** que l'outil propose dans *Réglages › Données* (voir plus bas).

**Charge vécue des agents.** Désactivée par défaut. Avant de l'activer, demandez l'avis de votre délégué à la protection des données et présentez l'outil à l'équipe. Une réponse par personne et par semaine (la dernière compte). La raison est facultative et visible par l'équipe ; le nom n'apparaît que si l'agent le choisit. Les propriétaires du document peuvent voir qui a répondu. Dans une petite équipe, une réponse peut être reconnue même sans nom.

**Mode affichage** : plein écran, texte agrandi, commandes de saisie masquées, rotation automatique des écrans, actualisation toutes les minutes. Échap pour en sortir. Pour un écran de service, ouvrez le document Grist sur l'ordinateur relié, agrandissez le widget, puis lancez le mode affichage.

## Le brancher en 3 minutes

1. **Ouvrir le document Grist de l'équipe**, de préférence celui qui contient déjà les tables de grist-reunion, grist-projet ou un tableau de bord grist-graphique. Un document vide convient aussi.
2. **Ajouter le widget** : *Ajouter › Ajouter une page › Personnalisé*, sur n'importe quelle table. Choisissez *URL personnalisée*, saisissez `https://lab17bis.github.io/grist-management/v1/` et donnez l'**accès complet au document**.
3. **Installer** : choisissez le niveau de cette vue (Équipe ou Pilotage), puis *Créer les tables* (`Meteo`, `Signalements`, `Priorites`, `Tensions_charge`), ou *avec un exemple fictif* pour essayer. Pour un nouvel espace, la météo est masquée et la charge vécue désactivée ; elles s'activent dans les réglages. Les tables existantes ne sont pas modifiées. À faire par un propriétaire du document.
4. **Pour l'autre niveau** : ajoutez une seconde vue Personnalisée avec la même adresse et choisissez son niveau dans *Réglages › Général › Cette vue Grist*, puis cliquez sur *Enregistrer* en haut à droite de la vue Grist.

Les écrans se composent alors automatiquement selon ce que contient le document. Pour ajouter un outil plus tard, il suffit d'installer son widget dans le même document : grist-reunion crée lui aussi ses tables.

## Le régler

La barre de l'éditeur est commune à tous les widgets : nom du widget et statut d'enregistrement à gauche, onglets *Réglages*, *En-tête et pied*, *Aperçu* et *Publication* au centre, bouton *Enregistrer* à droite. L'outil s'utilise dans l'onglet *Aperçu*, ouvert par défaut, avec son en-tête et son pied de page.

**Éditeur du widget ou page d'usage, avec le même lien.** Chaque vue Grist choisit ce qu'elle affiche (onglet *Publication*, rubrique *Affichage de cette vue Grist*) : l'**éditeur du widget** (affichage par défaut) ou la **page d'usage** (l'outil avec son en-tête et son pied de page, sans barre de réglages ; un lien *Éditer le widget*, en bas de page, rouvre l'éditeur). Après *Appliquer à cette vue*, cliquez sur *Enregistrer* en haut à droite de la vue Grist pour garder le choix. Pour avoir les deux dans un document, ajoutez deux vues Personnalisées avec la même adresse. Ce choix n'est pas une protection : les droits restent ceux du document (Partager, Permissions avancées).

L'onglet *Réglages* contient :

| Rubrique | Ce qu'on y règle |
| --- | --- |
| Écrans | Les écrans et leurs zones (type, largeur, titre, options : instance de réunion, source des actions, tableau de bord affiché, message). Chaque niveau a ses propres écrans, réglés depuis une vue de ce niveau |
| Météo et signalements | Rubriques (par défaut : santé et sécurité, qualité de service, délais, moyens, équipe), niveaux d'escalade, nombre de jours affichés, délai de résolution, durée de rotation, week-ends, météo affichée ou non |
| Deux niveaux | Liste des équipes (choix de la colonne `Equipe`), niveau et équipe de cette vue, charge vécue activée ou non, nombre de semaines de la tendance, nom de l'équipe des managers. Boutons pour ajouter les tables des deux niveaux à un document existant et préparer l'affectation des personnes aux équipes |
| En-tête et pied de page | Comme pour les autres outils de la famille |

Les réglages sont enregistrés en JSON dans la **description de la colonne `Config_management`** de la table `Meteo`.

## Modèle de données

| Table | Colonnes |
| --- | --- |
| `Meteo` | `Date`, `Rubrique` (choix), `Statut` (Conforme, À surveiller, Critique), `Commentaire`, `Saisi_par` (rempli par Grist), `Config_management` |
| `Signalements` | `Titre`, `Description`, `Rubrique` (choix), `Gravite` (Bloquante, Majeure, Mineure), `Statut` (Ouvert, En cours, Résolu), `Escalade` (choix), `Responsable`, `Resolution`, `Signale_par` et `Signale_le` (remplis par Grist), `Resolu_le`, `Equipe` (choix), `Nature` (Problème, Demande d'arbitrage) |
| `Priorites` | `Titre`, `Detail`, `Type` (Point chaud, Priorité), `Equipe`, `Debut`, `Fin`, `Ordre`, `Publie_par` (rempli par Grist) |
| `Tensions_charge` | `Semaine` (le lundi), `Equipe`, `Tension` (Normale, Tendue, Critique), `Commentaire`, `Qualifie_par` et `Qualifie_le` (remplis par Grist) |
| `Charge` (si activée) | `Semaine`, `Equipe`, `Niveau` (Confortable, Chargé, Débordé), `Raison`, `Nominatif`, `Nom`, `Saisi_par` et `Saisi_le` (remplis par Grist), `Retenue` (formule : la dernière réponse de la personne pour la semaine) |

Colonnes ajoutées aux tables existantes, sans rien retirer : `Meteo.Equipe`, `Actions_reunion.Equipe` (si grist-reunion est présent), `Personnes.Email` et `Personnes.Equipe` (sur demande, pour les règles par équipe).

Les valeurs de `Statut`, `Gravite`, `Nature`, `Type`, `Tension` et `Niveau` sont utilisées par le code : ne les renommez pas.

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
| `tests/` | Tests de l'interface (Playwright) : `test_management.py` (démonstration, deux niveaux), `test_deux_niveaux.py` et `test_table_existante.py` (document Grist simulé : installation, ajout à un document existant, règles d'accès, page publique) |
| `vendor/dsfr/` | DSFR 1.15.4, embarqué |

## Fonctionnement et sécurité

- Le widget lit et écrit avec les droits de la personne connectée et ne contourne aucune règle d'accès. Il n'affiche que ce que Grist lui transmet.
- Rien n'est publié hors de Grist : l'écran de service affiche le document ouvert dans Grist.
- Le dépôt ne contient jamais de données réelles, de clé, d'adresse de document Grist ni de nom réel.

## Limites

- Fonctionne uniquement dans Grist. Le plein écran peut être refusé par le navigateur à l'intérieur de Grist : utilisez alors le plein écran du navigateur (F11).
- Une personne appartient à une seule équipe dans les règles d'accès (colonne `Personnes.Equipe`) : un manager d'équipe qui participe aussi au pilotage a deux vues, mais les règles ne lui ouvrent que son équipe. Placez dans l'équipe des managers les personnes qui pilotent.
- Une réponse sur la charge enregistrée depuis une vue sans équipe n'a pas d'équipe : avec les règles par équipe, seuls les propriétaires la lisent. Choisissez une équipe pour chaque vue d'équipe.
- Les règles d'accès proposées ont été vérifiées sur un document simulé ; vérifiez-les dans votre document avec *Voir en tant que* avant d'ouvrir la charge vécue.
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

Ce que fait cet outil : il lit `Personnes` pour afficher les responsables des actions de projet. Sur demande (*Réglages › Général › Deux niveaux*, bouton *Préparer l'affectation des équipes*), il y ajoute les colonnes `Email` et `Equipe`, ou crée la table si elle manque, pour les règles d'accès par équipe.

**Réglages › Données** montre les tables partagées et les outils qui s'en servent, l'état des règles d'accès de `Meteo` et `Signalements`, et propose des **colonnes de lien** calculées par Grist (bouton *Ajouter les colonnes de lien*, réservé aux propriétaires) : `Signalements.Responsable_fiche`, `Signalements.Signale_par_fiche` et `Meteo.Saisi_par_fiche` relient le nom saisi à la fiche de `Personnes` (même nom, sans tenir compte des majuscules). Le texte saisi est gardé ; supprimer une de ces colonnes ne perd aucune donnée.

**Règles d'accès proposées** (bouton *Installer les règles proposées*, réservé aux propriétaires ; rien n'est posé sur une table qui a déjà des règles) :

- **Charge vécue** : l'auteur d'une réponse (`Saisi_par`, `Nom`) n'est lisible que par lui-même, sauf s'il a choisi de montrer son nom ; chacun ne répond qu'à son nom ; on ne modifie ni ne retire la réponse d'une autre personne.
- **Par équipe**, si la table `Personnes` a les colonnes `Email` et `Equipe` : un attribut d'utilisateur `Membre` relie la personne connectée à sa fiche par son adresse. Chaque personne ne lit et ne modifie que les lignes de son équipe (et les lignes sans équipe) dans `Meteo`, `Priorites`, `Tensions_charge` et `Signalements` ; la charge vécue n'est lue que par l'équipe concernée ; l'équipe des managers (par défaut `Pilotage`) lit toutes les équipes, sauf la charge vécue, et ne lit des signalements que ceux escaladés et les demandes d'arbitrage.

Les propriétaires du document gardent tous les droits : réservez ce rôle aux personnes qui administrent le document. Une personne sans fiche dans `Personnes` ne lit que les lignes sans équipe.

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
- [grist-annuaire](https://github.com/lab17bis/grist-annuaire) : annuaire des personnes et des structures d'un document : recherche, fiches, doublons, import, protection des données.
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

La page publique n'affiche **jamais** la charge vécue ni la tension de charge, même si un écran les contient, et ne lit pas ces tables.

Le partage en lecture publique rend lisibles **toutes** les tables du document, pas seulement celles que la page affiche. Pour masquer une table ou une colonne au public, utilisez les règles d'accès de Grist, par exemple avec la condition `not user.IsLoggedIn` (lecture refusée). La page tolère une table masquée. Testez en navigation privée avant de diffuser le lien.

## Licence

Code sous licence MIT (voir `LICENSE`). Le DSFR embarqué dans `vendor/dsfr/` conserve sa propre licence.

Conçu par le Lab 17 bis, laboratoire d'innovation publique de l'académie de Reims. Contact : <lab17bis@ac-reims.fr>

Widget conçu par le Lab 17 bis, le laboratoire d'innovation publique de l'académie de Reims.

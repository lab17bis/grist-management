"""Deux niveaux (équipe et pilotage) dans un document Grist simulé : python3 tests/test_deux_niveaux.py
Serveur attendu : la racine du dépôt sur PORT (par défaut 8780). Utilise l'API Grist simulée de test/grist-mock.js
(options de la vue clé par clé, règles d'accès simulées)."""
import os, sys, json, copy
from playwright.sync_api import sync_playwright
sys.path.insert(0, '/home/claude/grist-core/sandbox/grist')
from predicate_formula import parse_predicate_formula_json as analyser
PORT = os.environ.get('PORT', '8780')
ok = ko = 0
def verifier(nom, cond):
    global ok, ko
    print(('OK   ' if cond else 'ÉCHEC ') + nom); ok += bool(cond); ko += (not cond)
MOCK = open(os.environ.get('MOCK', '/home/claude/test/grist-mock.js')).read()
HOTE = '<!DOCTYPE html><html><body style="margin:0"><iframe id="w" style="width:100%;height:100vh;border:0"></iframe><script>window.charger=function(u){document.getElementById("w").src=u;};</script></body></html>'
ACL_VIDE = {'res': [{'id': 1, 'tableId': '*', 'colIds': '*'}], 'regles': []}
def ouvrir(b, mock):
    pg = b.new_page(viewport={'width': 1280, 'height': 900}); err = []
    pg.on('pageerror', lambda e: err.append(str(e)))
    pg.route('**/grist-plugin-api.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body=MOCK))
    pg.route(f'http://localhost:{PORT}/__hote.html', lambda r: r.fulfill(status=200, content_type='text/html', body=HOTE))
    pg.goto(f'http://localhost:{PORT}/__hote.html')
    m = dict({'table': 'Meteo', 'utilisateur': {'email': 'test@exemple.fr', 'nom': 'Test'}}, **mock)
    pg.evaluate('([m,u]) => { window.MOCK = m; charger(u); }', [m, '/grist-management/index.html'])
    pg.wait_for_timeout(1500)
    return pg, pg.frame_locator('#w'), err
def texte(f): return f.locator('body').inner_text()
def formulaires(pg, f, nom):
    n = f.locator('[data-form="' + nom + '"]').count()
    for e in f.locator('[data-ecran]').all():
        e.click(); pg.wait_for_timeout(300); n = max(n, f.locator('[data-form="' + nom + '"]').count())
    return n
def textes(pg, f):
    x = texte(f)
    for e in f.locator('[data-ecran]').all():
        e.click(); pg.wait_for_timeout(300); x += texte(f)
    return x
def doc(pg): return pg.evaluate('window.MOCK')
def choix(col): return json.loads(col.get('widgetOptions') or '{}').get('choices', [])

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROME') or None, args=['--no-sandbox'])

    # 1. Nouvel espace, vue Pilotage choisie à l'installation
    # (le widget est posé sur une table quelconque, comme dans Grist)
    pg, f, err = ouvrir(b, {'tables': {'Autre': {'colonnes': {'X': {'type': 'Text'}}, 'lignes': []}}, 'table': 'Autre'})
    f.locator('label[for="inst-pi"]').click()
    f.get_by_role('button', name='Créer les tables', exact=True).click(); pg.wait_for_timeout(2000)
    m = doc(pg); t = m['tables']
    verifier('installation : tables des deux niveaux créées', 'Priorites' in t and 'Tensions_charge' in t)
    verifier('installation : colonnes Equipe et Nature des signalements', 'Equipe' in t['Signalements']['colonnes'] and 'Nature' in t['Signalements']['colonnes'])
    verifier('installation : Nature a les deux choix', choix(t['Signalements']['colonnes']['Nature']) == ['Problème', "Demande d'arbitrage"])
    verifier('installation : pas de table Charge (désactivée par défaut)', 'Charge' not in t)
    cfg = json.loads(t['Meteo']['colonnes']['Config_management'].get('description') or '{}')
    verifier('installation : météo masquée pour un nouvel espace', cfg.get('meteo') is False)
    verifier('installation : niveau Pilotage enregistré dans les options de la vue', (m.get('options') or {}).get('niveauMg') == 'pilotage')
    verifier('installation : la vue affiche le niveau Pilotage', 'PILOTAGE' in f.locator('.mg-niveau').inner_text().upper())
    verifier('installation : table Affectations créée (Email, Nom, Equipes, Manager_de en listes de choix)', 'Affectations' in t and all(c in t['Affectations']['colonnes'] for c in ['Email', 'Nom', 'Equipes', 'Manager_de']) and t['Affectations']['colonnes']['Equipes']['type'] == 'ChoiceList' and t['Affectations']['colonnes']['Manager_de']['type'] == 'ChoiceList')
    verifier('installation : aucune erreur', not err)
    pilote = copy.deepcopy(t); pg.close()

    # 2. Document existant d'avant les deux niveaux : rien n'est retiré, tout est ajouté sur demande
    ancien = copy.deepcopy(pilote)
    for x in ['Priorites', 'Tensions_charge', 'Affectations']: del ancien[x]
    for c in ['Equipe', 'Nature']: del ancien['Signalements']['colonnes'][c]
    del ancien['Meteo']['colonnes']['Equipe']
    ancien['Meteo']['colonnes']['Config_management']['description'] = ''
    ancien['Signalements']['lignes'] = [{'id': 1, 'Titre': 'Ancien signalement', 'Statut': 'Ouvert'}]
    pg, f, err = ouvrir(b, {'tables': ancien})
    verifier('document existant : la vue fonctionne sans les nouvelles tables', f.locator('.mg-grille').count() == 1 and 'Ancien signalement' in texte(f))
    verifier('document existant : niveau Équipe par défaut', 'PILOTAGE' not in f.locator('.mg-niveau').inner_text().upper())
    f.locator('.cl-barre label', has_text='Réglages').click(); f.locator('#rg-eq').wait_for()
    f.get_by_role('button', name='Ajouter les tables et colonnes des deux niveaux').click(); pg.wait_for_timeout(1500)
    t = doc(pg)['tables']
    verifier('ajout : tables et colonnes des deux niveaux', 'Priorites' in t and 'Tensions_charge' in t and 'Equipe' in t['Signalements']['colonnes'] and 'Equipe' in t['Meteo']['colonnes'])
    verifier('ajout : colonnes de saisie, pas de formule vide', t['Meteo']['colonnes']['Equipe'].get('isFormula') is False and t['Signalements']['colonnes']['Nature'].get('isFormula') is False)
    verifier('ajout : données gardées', t['Signalements']['lignes'][0]['Titre'] == 'Ancien signalement')
    f.locator('#rg-eq').fill('Accueil\nGestion')
    f.locator('label[for="rg-charge"]').click()
    f.get_by_role('button', name='Enregistrer', exact=True).first.click(); pg.wait_for_timeout(1500)
    t = doc(pg)['tables']
    verifier('charge activée : table Charge créée', 'Charge' in t and all(c in t['Charge']['colonnes'] for c in ['Semaine', 'Equipe', 'Niveau', 'Raison', 'Nominatif', 'Saisi_par', 'Retenue']))
    verifier('charge activée : une réponse par personne et par semaine (formule Retenue)', 'lookupRecords(Saisi_par=$Saisi_par, Semaine=$Semaine, Equipe=$Equipe)' in (t.get('Charge', {}).get('colonnes', {}).get('Retenue', {}).get('formula') or ''))
    verifier('équipes : choix de la colonne Equipe mis à jour', all(choix(t[x]['colonnes']['Equipe']) == ['Accueil', 'Gestion'] for x in ['Signalements', 'Meteo', 'Priorites', 'Tensions_charge', 'Charge']))
    cfg = json.loads(t['Meteo']['colonnes']['Config_management'].get('description') or '{}')
    verifier('réglages enregistrés : équipes et charge', cfg.get('equipes') == ['Accueil', 'Gestion'] and cfg.get('charge') is True)
    verifier('réglages enregistrés : écrans automatiques non figés', 'ecrans' not in cfg and 'ecransPilotage' not in cfg and '_ecransAuto' not in cfg)
    f.locator('.cl-barre label', has_text='Aperçu').click(); pg.wait_for_timeout(600)
    verifier('charge activée : la zone apparaît dans les écrans automatiques', f.locator('[data-ecran]', has_text='Charge').count() == 1)
    f.locator('[data-ecran]', has_text='Charge').click(); pg.wait_for_timeout(400)
    verifier('charge activée : zone de la charge vécue affichée', f.locator('.mg-zone--charge').count() == 1)
    f.locator('.cl-barre label', has_text='Réglages').click(); f.locator('#rg-eq').wait_for()
    # Choix de l'équipe de cette vue
    f.locator('#vue-equipe').select_option('Gestion'); f.get_by_role('button', name='Appliquer à cette vue').click(); pg.wait_for_timeout(1000)
    o = doc(pg).get('options') or {}
    verifier('vue : équipe enregistrée dans les options de la vue, niveau Équipe', o.get('equipeMg') == 'Gestion' and 'niveauMg' not in o)
    # Affectation des personnes : table Affectations tenue par les propriétaires
    f.get_by_role('button', name="Créer la table Affectations").click(); pg.wait_for_timeout(1200)
    t = doc(pg)['tables']
    verifier('affectations : table créée, choix = équipes + équipe des managers', 'Affectations' in t and choix(t['Affectations']['colonnes']['Equipes']) == ['Accueil', 'Gestion', 'Pilotage'] and choix(t['Affectations']['colonnes']['Manager_de']) == ['Accueil', 'Gestion', 'Pilotage'])
    verifier('affectations : colonnes de saisie, pas de formule vide', all(t['Affectations']['colonnes'][c].get('isFormula') is False for c in ['Email', 'Equipes', 'Manager_de']))
    f.locator('#re-0').fill('Écran retouché'); f.get_by_role('button', name='Enregistrer', exact=True).first.click(); pg.wait_for_timeout(1200)
    cfg = json.loads(doc(pg)['tables']['Meteo']['colonnes']['Config_management']['description'])
    verifier('écrans retouchés : enregistrés pour le niveau Équipe', (cfg.get('ecrans') or [{}])[0].get('titre') == 'Écran retouché' and 'ecransPilotage' not in cfg)
    verifier('document existant : aucune erreur', not err)
    avecPersonnes = copy.deepcopy(t); pg.close()
    avecPersonnes['Actions_reunion'] = {'colonnes': {'Action': {'type': 'Text'}, 'Equipe': {'type': 'Choice'}}, 'lignes': []}

    # 2 bis. Reprise des équipes de la version précédente (colonne Equipe de Personnes)
    anc = copy.deepcopy(avecPersonnes)
    anc['Personnes'] = {'colonnes': {'Nom': {'type': 'Text'}, 'Email': {'type': 'Text'}, 'Equipe': {'type': 'Choice', 'widgetOptions': json.dumps({'choices': ['Accueil', 'Gestion', 'Pilotage']})}},
                        'lignes': [{'id': 1, 'Nom': 'Agent A', 'Email': 'Agent.A@exemple.fr ', 'Equipe': 'Accueil'}, {'id': 2, 'Nom': 'Sans équipe', 'Email': 'x@exemple.fr', 'Equipe': ''},
                                   {'id': 3, 'Nom': 'Déjà affecté', 'Email': 'deja@exemple.fr', 'Equipe': 'Gestion'}]}
    anc['Affectations']['lignes'] = [{'id': 1, 'Email': 'DEJA@exemple.fr', 'Nom': 'Déjà affecté', 'Equipes': ['L', 'Gestion'], 'Manager_de': None}]
    pg, f, err = ouvrir(b, {'tables': anc})
    f.locator('.cl-barre label', has_text='Réglages').click(); f.locator('#rg-eq').wait_for()
    verifier('reprise : proposée pour la seule personne à reprendre', '1 personne absente' in texte(f))
    f.get_by_role('button', name='Reprendre ces équipes dans Affectations').click(); pg.wait_for_timeout(1200)
    l = doc(pg)['tables']['Affectations']['lignes']
    verifier('reprise : ligne ajoutée avec son équipe, sans rôle de manager', len(l) == 2 and l[1]['Email'] == 'Agent.A@exemple.fr' and l[1]['Equipes'] == ['L', 'Accueil'] and not l[1].get('Manager_de'))
    verifier('reprise : Personnes inchangée', doc(pg)['tables']['Personnes']['lignes'] == anc['Personnes']['lignes'])
    verifier('reprise : aucune erreur', not err); pg.close()

    # 3. Règles d'accès proposées et installées
    pg, f, err = ouvrir(b, {'tables': avecPersonnes, 'acl': copy.deepcopy(ACL_VIDE), 'options': {'equipeMg': 'Gestion'}})
    f.locator('.cl-barre label', has_text='Réglages').click(); f.get_by_text('Données', exact=True).first.click(); pg.wait_for_timeout(800)
    x = texte(f)
    verifier('règles : proposées (charge, équipes, managers, pilotage, affectations)', 'auteur d\'une réponse' in x and 'ses équipes' in x and 'escaladés' in x and 'seuls les managers' in x and 'se déclarer manager' in x)
    f.locator('[data-donnees="regles"]').click(); pg.wait_for_timeout(1500)
    acl = doc(pg)['acl']
    attr = [r for r in acl['regles'] if r.get('userAttributes')]
    verifier('règles : attribut Membre (Affectations par Email) sur la ressource par défaut', len(attr) == 1 and json.loads(attr[0]['userAttributes']) == {'name': 'Membre', 'tableId': 'Affectations', 'lookupColId': 'Email', 'charId': 'Email'} and attr[0]['resource'] == 1)
    res = {r['id']: (r['tableId'], r['colIds']) for r in acl['res']}
    def regles(tb, cols='*'): return [r for r in acl['regles'] if res.get(r['resource']) == (tb, cols)]
    def a(tb, droits, *morceaux, cols='*'): return any(r['permissionsText'] == droits and all(m in r['aclFormula'] for m in morceaux) for r in regles(tb, cols))
    erreurs = []
    for r in acl['regles']:
        if r.get('aclFormula'):
            try: analyser(r['aclFormula'])
            except Exception as e: erreurs.append((r['aclFormula'], e))
    verifier('règles : toutes les formules sont acceptées par l\'analyseur de Grist', not erreurs and len([r for r in acl['regles'] if r.get('aclFormula')]) >= 25)
    verifier('règles : affectations modifiables par les seuls propriétaires', a('Affectations', '-CUD', 'user.Access != OWNER'))
    verifier('règles : chacun ne voit que ses propres équipes et son rôle', a('Affectations', '-R', 'rec.Email.lower() == user.Email.lower()', cols='Equipes,Manager_de'))
    verifier('règles : auteur d\'une réponse de charge masqué', a('Charge', '-R', 'rec.Nominatif', cols='Saisi_par,Nom'))
    verifier('règles : charge lue par la seule équipe concernée (plusieurs équipes possibles)', a('Charge', '-RUD', 'rec.Equipe not in user.Membre.Equipes'))
    verifier('règles : on ne répond qu\'à son nom et pour une de ses équipes', a('Charge', '-CU', 'newRec.Saisi_par != user.Email') and a('Charge', '-CU', 'newRec.Equipe not in user.Membre.Equipes'))
    verifier('règles : lignes des autres équipes ni lues (sauf pilotage), ni modifiées, ni créées', all(a(tb, '-R', 'not "Pilotage" in user.Membre.Equipes', 'rec.Equipe not in user.Membre.Equipes') and a(tb, '-UD', 'rec.Equipe not in') and a(tb, '-CU', 'newRec.Equipe not in user.Membre.Equipes') for tb in ['Meteo', 'Priorites', 'Tensions_charge', 'Actions_reunion']))
    verifier('règles : la charge et le signalement restent ouverts à chacun pour ses équipes (pas de règle « manager »)', not any('Manager_de' in r['aclFormula'] for r in regles('Charge') + regles('Signalements') + regles('Meteo')))
    verifier('règles : priorités et tension réservées aux managers de l\'équipe', all(a(tb, '-CU', 'newRec.Equipe in user.Membre.Manager_de', '"Pilotage" in user.Membre.Manager_de') and a(tb, '-D', 'rec.Equipe in user.Membre.Manager_de') for tb in ['Priorites', 'Tensions_charge']))
    verifier('règles : le pilotage ne lit des autres équipes que les escalades et arbitrages', a('Signalements', '-RU', '"Pilotage" in user.Membre.Equipes', 'rec.Equipe not in user.Membre.Equipes', '"Demande d\'arbitrage"'))
    verifier('règles : signalements des autres équipes', a('Signalements', '-RUD', 'not "Pilotage" in user.Membre.Equipes') and a('Signalements', '-D', '"Pilotage" in user.Membre.Equipes') and a('Signalements', '-C', 'newRec.Equipe not in'))
    verifier('règles : les propriétaires gardent tous les droits', all('user.Access != OWNER' in r['aclFormula'] for r in acl['regles'] if r.get('aclFormula')))
    verifier('règles : aucune erreur', not err); pg.close()

    # 4. Règles déjà posées : rien n'est installé en double
    pg, f, err = ouvrir(b, {'tables': avecPersonnes, 'acl': acl})
    f.locator('.cl-barre label', has_text='Réglages').click(); f.get_by_text('Données', exact=True).first.click(); pg.wait_for_timeout(800)
    verifier('règles déjà posées : pas de nouvelle installation proposée', f.locator('[data-donnees="regles"]').count() == 0 or f.locator('[data-donnees="regles"]').is_disabled())
    pg.close()

    # 4 bis. Règles de la version précédente (Personnes.Equipe) : mises à jour, les règles posées par ailleurs gardées
    ancienne = {'res': [{'id': 1, 'tableId': '*', 'colIds': '*'}, {'id': 2, 'tableId': 'Meteo', 'colIds': '*'}, {'id': 3, 'tableId': 'Signalements', 'colIds': '*'}, {'id': 4, 'tableId': 'Projets', 'colIds': '*'}],
                'regles': [{'id': 1, 'resource': 1, 'aclFormula': '', 'permissionsText': '', 'rulePos': 1, 'memo': '', 'userAttributes': json.dumps({'name': 'Membre', 'tableId': 'Personnes', 'lookupColId': 'Email', 'charId': 'Email'})},
                           {'id': 2, 'resource': 2, 'aclFormula': 'user.Access != OWNER and user.Membre.Equipe != "Pilotage" and rec.Equipe and rec.Equipe != user.Membre.Equipe', 'permissionsText': '-RUD', 'rulePos': 2, 'memo': "Ligne d'une autre équipe", 'userAttributes': ''},
                           {'id': 3, 'resource': 3, 'aclFormula': 'user.Access != OWNER and rec.Equipe == "X"', 'permissionsText': '-R', 'rulePos': 3, 'memo': 'Règle maison', 'userAttributes': ''},
                           {'id': 4, 'resource': 3, 'aclFormula': 'user.Access != OWNER and user.Membre.Equipe != "Pilotage" and rec.Equipe and rec.Equipe != user.Membre.Equipe', 'permissionsText': '-RUD', 'rulePos': 4, 'memo': "Signalement d'une autre équipe", 'userAttributes': ''},
                           {'id': 5, 'resource': 4, 'aclFormula': 'user.Access != OWNER', 'permissionsText': '-D', 'rulePos': 5, 'memo': 'Projets', 'userAttributes': ''}]}
    pg, f, err = ouvrir(b, {'tables': avecPersonnes, 'acl': copy.deepcopy(ancienne)})
    f.locator('.cl-barre label', has_text='Réglages').click(); f.get_by_text('Données', exact=True).first.click(); pg.wait_for_timeout(800)
    x = texte(f)
    verifier('mise à jour : état « version précédente » et bouton de mise à jour', 'version précédente de l\'outil' in x and f.get_by_role('button', name='Mettre à jour les règles').count() == 1)
    f.locator('[data-donnees="regles"]').click(); pg.wait_for_timeout(1500)
    acl2 = doc(pg)['acl']; res2 = {r['id']: (r['tableId'], r['colIds']) for r in acl2['res']}
    r2 = lambda tb: [r for r in acl2['regles'] if res2.get(r['resource']) == (tb, '*')]
    attr = [r for r in acl2['regles'] if r.get('userAttributes')]
    verifier('mise à jour : attribut Membre déplacé sur Affectations (même ligne)', len(attr) == 1 and attr[0]['id'] == 1 and json.loads(attr[0]['userAttributes'])['tableId'] == 'Affectations')
    verifier('mise à jour : anciennes règles de la météo remplacées', not any('user.Membre.Equipe !=' in r['aclFormula'] for r in r2('Meteo')) and any('user.Membre.Equipes' in r['aclFormula'] for r in r2('Meteo')))
    verifier('mise à jour : table avec une règle maison laissée telle quelle', [r['id'] for r in r2('Signalements')] == [3, 4])
    verifier('mise à jour : règles des autres tables gardées', [r['id'] for r in r2('Projets')] == [5])
    verifier('mise à jour : aucune erreur', not err); pg.close()

    # 4 ter. Droits de la personne connectée : seule sa ligne d'affectation arrive en clair (règles posées, pas propriétaire)
    dr = copy.deepcopy(avecPersonnes)
    dr['Affectations']['lignes'] = [{'id': 1, 'Email': 'autre@exemple.fr', 'Nom': 'Autre', 'Equipes': ['C'], 'Manager_de': ['C']},
                                    {'id': 2, 'Email': 'test@exemple.fr', 'Nom': 'Moi', 'Equipes': ['L', 'Accueil', 'Gestion'], 'Manager_de': ['L', 'Gestion']}]
    dr['Priorites']['lignes'] = [{'id': 1, 'Titre': 'Prio Gestion', 'Type': 'Priorité', 'Equipe': 'Gestion', 'Debut': 0}, {'id': 2, 'Titre': 'Prio Accueil', 'Type': 'Priorité', 'Equipe': 'Accueil', 'Debut': 0}]
    pg, f, err = ouvrir(b, {'tables': copy.deepcopy(dr), 'options': {'equipeMg': 'Gestion'}})
    verifier('manager de l\'équipe : formulaires de priorité et de tension proposés', formulaires(pg, f, 'priorite') == 1 and formulaires(pg, f, 'tension') == 1)
    pg.close()
    pg, f, err = ouvrir(b, {'tables': copy.deepcopy(dr), 'options': {'equipeMg': 'Accueil'}})
    x = textes(pg, f)
    verifier('membre non manager : ni publication ni qualification, avec explication', formulaires(pg, f, 'priorite') == 0 and formulaires(pg, f, 'tension') == 0 and 'Publication réservée aux managers' in x and 'Qualification réservée aux managers' in x)
    verifier('membre non manager : pas de bouton Retirer sur les priorités', f.locator('[data-priorite]').count() == 0)
    verifier('membre non manager : il répond quand même sur sa charge et signale', formulaires(pg, f, 'signalement') == 1 and formulaires(pg, f, 'charge') == 1)
    pg.close()
    sans = copy.deepcopy(dr); sans['Affectations']['lignes'][1]['Equipes'] = ['C']; sans['Affectations']['lignes'][1]['Manager_de'] = ['C']
    pg, f, err = ouvrir(b, {'tables': sans, 'options': {'equipeMg': 'Gestion'}})
    verifier('personne sans affectation : pas de publication', f.locator('[data-form="priorite"]').count() == 0)
    pg.close()
    pg, f, err = ouvrir(b, {'tables': copy.deepcopy(dr), 'acl': copy.deepcopy(acl), 'options': {'equipeMg': 'Accueil'}})
    verifier('propriétaire (règles lisibles) : tout est proposé', formulaires(pg, f, 'priorite') == 1 and formulaires(pg, f, 'tension') == 1)
    pg.close()
    # Refus de Grist : le message de la règle est affiché
    pg, f, err = ouvrir(b, {'tables': copy.deepcopy(dr), 'options': {'equipeMg': 'Gestion'}, 'refus': {'Tensions_charge': ["Seuls les managers de l'équipe qualifient sa tension de charge"]}})
    f.locator('[data-ecran]', has_text='Charge').click(); pg.wait_for_timeout(300); f.locator('.mg-zone--tension summary').click(); f.locator('label[for="te-1"]').click(); f.locator('[data-form="tension"] button[type="submit"]').click(); pg.wait_for_timeout(800)
    verifier('refus de Grist : le message de la règle est affiché', "Enregistrement refusé : Seuls les managers de l'équipe qualifient" in texte(f))
    verifier('droits : aucune erreur', not err); pg.close()
    # Vue sans équipe : on ne qualifie pas une tension « toutes équipes » et on ne répond pas sur la charge
    pg, f, err = ouvrir(b, {'tables': copy.deepcopy(dr), 'options': {}})
    x = textes(pg, f)
    verifier('vue toutes équipes : pas de tension sans équipe', f.locator('[data-form="tension"]').count() == 0 and 'choisissez l\'équipe de cette vue' in x)
    pg.close()

    # 5. Page publique : jamais la charge ni la tension, même si un écran les contient
    pub = copy.deepcopy(avecPersonnes)
    cfg = json.loads(pub['Meteo']['colonnes']['Config_management']['description'])
    cfg['ecrans'] = [{'titre': 'Tout', 'zones': [{'type': 'charge'}, {'type': 'tension'}, {'type': 'signalements'}]}, {'titre': 'Privé', 'zones': [{'type': 'tensions'}]}]
    pub['Meteo']['colonnes']['Config_management']['description'] = json.dumps(cfg)
    pg, f, err = ouvrir(b, {'tables': pub})
    verifier('écrans composés : la vue d\'équipe montre la charge', f.locator('.mg-zone--charge').count() == 1)
    pg.close()
    pub['Charge']['lignes'] = [{'id': 1, 'Semaine': 0, 'Equipe': 'Accueil', 'Niveau': 'Débordé', 'Raison': 'Raison secrète', 'Saisi_par': 'agent@exemple.fr', 'Retenue': True}]
    pub['Tensions_charge']['lignes'] = [{'id': 1, 'Semaine': 0, 'Equipe': 'Accueil', 'Tension': 'Critique', 'Commentaire': 'Tension secrète'}]
    pub['Signalements']['lignes'] = [{'id': 1, 'Titre': 'Signalement public', 'Statut': 'Ouvert', 'Gravite': 'Majeure', 'Equipe': 'Accueil'}]
    lus = []
    def api(route):
        u = route.request.url.split('/api/docs/pub')[1].split('?')[0]; lus.append(u)
        seg = [x for x in u.split('/') if x]
        if len(seg) == 3 and seg[1] not in pub: return route.fulfill(status=404, body='{}')
        if seg == ['tables']: corps = {'tables': [{'id': t, 'fields': {'tableRef': i + 1}} for i, t in enumerate(pub)]}
        elif len(seg) == 3 and seg[2] == 'columns': corps = {'columns': [{'id': c, 'fields': {'type': d.get('type') or 'Any', 'widgetOptions': d.get('widgetOptions') or '', 'description': d.get('description') or ''}} for c, d in pub[seg[1]]['colonnes'].items()]}
        elif len(seg) == 3 and seg[2] == 'records': corps = {'records': [{'id': l['id'], 'fields': {k: v for k, v in l.items() if k != 'id'}} for l in pub[seg[1]]['lignes']]}
        else: return route.fulfill(status=404, body='{}')
        route.fulfill(status=200, content_type='application/json', body=json.dumps(corps))
    pg = b.new_page(viewport={'width': 1280, 'height': 900}); err = []
    pg.on('pageerror', lambda e: err.append(str(e)))
    pg.route('**/grist-plugin-api.js', lambda r: r.fulfill(status=200, content_type='application/javascript', body=''))
    pg.route(f'http://localhost:{PORT}/api/docs/pub/**', api)
    pg.goto(f'http://localhost:{PORT}/grist-management/?public=1&doc=http://localhost:{PORT}/api/docs/pub&table=Meteo'); pg.wait_for_timeout(2500)
    x = pg.locator('body').inner_text()
    verifier('page publique : l\'outil s\'affiche', 'Signalement public' in x)
    verifier('page publique : ni charge ni tension, même dans un écran composé', pg.locator('.mg-zone--charge, .mg-zone--tension, .mg-zone--tensions').count() == 0 and 'Raison secrète' not in x and 'Tension secrète' not in x)
    verifier('page publique : l\'écran qui ne contenait que la tension disparaît', pg.locator('[data-ecran]', has_text='Privé').count() == 0)
    verifier('page publique : les lignes de Charge et Tensions_charge ne sont jamais demandées', not any(u.startswith('/tables/Charge/records') or u.startswith('/tables/Tensions_charge/records') for u in lus))
    verifier('page publique : aucune erreur', not err)
    pg.close()
    b.close()
print(f'{ok} OK, {ko} échec(s)'); sys.exit(1 if ko else 0)

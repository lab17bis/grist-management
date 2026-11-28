"""Deux niveaux (équipe et pilotage) dans un document Grist simulé : python3 tests/test_deux_niveaux.py
Serveur attendu : la racine du dépôt sur PORT (par défaut 8780). Utilise l'API Grist simulée de test/grist-mock.js
(options de la vue clé par clé, règles d'accès simulées)."""
import os, sys, json, copy
from playwright.sync_api import sync_playwright
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
    verifier('installation : aucune erreur', not err)
    pilote = copy.deepcopy(t); pg.close()

    # 2. Document existant d'avant les deux niveaux : rien n'est retiré, tout est ajouté sur demande
    ancien = copy.deepcopy(pilote)
    for x in ['Priorites', 'Tensions_charge']: del ancien[x]
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
    # Affectation des personnes
    f.get_by_role('button', name="Préparer l'affectation des équipes").click(); pg.wait_for_timeout(1200)
    t = doc(pg)['tables']
    verifier('personnes : table Personnes avec Email et Equipe (équipes et managers)', 'Personnes' in t and 'Email' in t['Personnes']['colonnes'] and choix(t['Personnes']['colonnes']['Equipe']) == ['Accueil', 'Gestion', 'Pilotage'])
    f.locator('#re-0').fill('Écran retouché'); f.get_by_role('button', name='Enregistrer', exact=True).first.click(); pg.wait_for_timeout(1200)
    cfg = json.loads(doc(pg)['tables']['Meteo']['colonnes']['Config_management']['description'])
    verifier('écrans retouchés : enregistrés pour le niveau Équipe', (cfg.get('ecrans') or [{}])[0].get('titre') == 'Écran retouché' and 'ecransPilotage' not in cfg)
    verifier('document existant : aucune erreur', not err)
    avecPersonnes = copy.deepcopy(t); pg.close()

    # 3. Règles d'accès proposées et installées
    pg, f, err = ouvrir(b, {'tables': avecPersonnes, 'acl': copy.deepcopy(ACL_VIDE), 'options': {'equipeMg': 'Gestion'}})
    f.locator('.cl-barre label', has_text='Réglages').click(); f.get_by_text('Données', exact=True).first.click(); pg.wait_for_timeout(800)
    x = texte(f)
    verifier('règles : proposées (charge, équipes, pilotage)', 'auteur d\'une réponse' in x and 'son équipe' in x and 'escaladés' in x)
    f.locator('[data-donnees="regles"]').click(); pg.wait_for_timeout(1500)
    acl = doc(pg)['acl']
    attr = [r for r in acl['regles'] if r.get('userAttributes')]
    verifier('règles : attribut Membre (Personnes par Email) sur la ressource par défaut', len(attr) == 1 and json.loads(attr[0]['userAttributes']) == {'name': 'Membre', 'tableId': 'Personnes', 'lookupColId': 'Email', 'charId': 'Email'} and attr[0]['resource'] == 1)
    res = {r['id']: (r['tableId'], r['colIds']) for r in acl['res']}
    def regles(tb, cols='*'): return [r for r in acl['regles'] if res.get(r['resource']) == (tb, cols)]
    verifier('règles : auteur d\'une réponse de charge masqué', any(r['permissionsText'] == '-R' and 'rec.Nominatif' in r['aclFormula'] for r in regles('Charge', 'Saisi_par,Nom')))
    verifier('règles : charge lue par la seule équipe concernée', any(r['permissionsText'] == '-R' and 'rec.Equipe != user.Membre.Equipe' in r['aclFormula'] for r in regles('Charge')))
    verifier('règles : on ne répond qu\'à son nom', any(r['permissionsText'] == '-CU' and 'newRec.Saisi_par != user.Email' in r['aclFormula'] for r in regles('Charge')))
    verifier('règles : chaque équipe ne lit que ses lignes (météo, priorités, tensions, signalements)', all(any(r['permissionsText'] == '-RUD' and 'user.Membre.Equipe != "Pilotage"' in r['aclFormula'] for r in regles(tb)) for tb in ['Meteo', 'Priorites', 'Tensions_charge', 'Signalements']))
    verifier('règles : le pilotage ne lit que les signalements escaladés et les arbitrages', any(r['permissionsText'] == '-R' and 'user.Membre.Equipe == "Pilotage"' in r['aclFormula'] and '"Demande d\'arbitrage"' in r['aclFormula'] for r in regles('Signalements')))
    verifier('règles : les propriétaires gardent tous les droits', all('user.Access != OWNER' in r['aclFormula'] for r in acl['regles'] if r.get('aclFormula')))
    verifier('règles : aucune erreur', not err); pg.close()

    # 4. Règles déjà posées : rien n'est installé en double
    pg, f, err = ouvrir(b, {'tables': avecPersonnes, 'acl': acl})
    f.locator('.cl-barre label', has_text='Réglages').click(); f.get_by_text('Données', exact=True).first.click(); pg.wait_for_timeout(800)
    verifier('règles déjà posées : pas de nouvelle installation proposée', f.locator('[data-donnees="regles"]').count() == 0 or f.locator('[data-donnees="regles"]').is_disabled())
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

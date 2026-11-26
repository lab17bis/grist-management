"""Tests du mode démonstration : python3 tests/test_management.py
Le dossier parent doit contenir grist-graphique (comme sur lab17bis.github.io).
Variables : CHROME (navigateur), URL (par défaut http://localhost:8780/grist-management/)."""
import os, sys
from playwright.sync_api import sync_playwright
URL = os.environ.get('URL', 'http://localhost:8780/grist-management/')
ok = ko = 0
def verifier(nom, cond):
    global ok, ko
    print(('OK   ' if cond else 'ÉCHEC ') + nom); ok += bool(cond); ko += (not cond)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROME') or None, args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': 1400, 'height': 1000}); erreurs = []
    pg.on('pageerror', lambda e: erreurs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('.mg-grille')
    # Version figée v1 : les modules de grist-graphique doivent se charger (régression 2026-11-26, chemin doublé).
    pv = b.new_page(); pv.goto(URL.rstrip('/') + '/v1/'); pv.wait_for_selector('.mg-grille')
    verifier('v1 : modules grist-graphique chargés', pv.evaluate('!!(window.Tableau && window.Donnees)')); pv.close()
    verifier('écrans automatiques', pg.locator('[data-ecran]').count() == 3)
    verifier('chiffres clés', pg.locator('.mg-chiffre').count() >= 4)
    verifier('météo : 5 rubriques', pg.locator('.mg-meteo tbody tr').count() == 5)
    verifier('météo : cases critiques', pg.locator('.mg-meteo__case.mg-statut--rouge').count() >= 1)
    verifier('signalements ouverts : 3', pg.locator('.mg-signalement').count() == 3)
    verifier('signalement bloquant en tête', 'File d' in pg.locator('.mg-signalement__titre').first.inner_text())
    verifier('actions des deux outils', pg.locator('.mg-action__meta', has_text='Réunion').count() >= 1 and pg.locator('.mg-action__meta', has_text='Projet').count() >= 1)
    pg.locator('summary', has_text='Renseigner la météo').click()
    pg.locator('label[for="mt-4-0"]').click(); pg.get_by_role('button', name='Enregistrer la météo du jour').click()
    verifier('saisie de la météo du jour', pg.get_by_text('Météo du jour enregistrée').count() == 1)
    pg.locator('summary', has_text='Signaler un problème').click()
    pg.fill('#sg-titre', 'Problème de test'); pg.get_by_role('button', name='Signaler', exact=True).click()
    verifier('signaler un problème', pg.locator('.mg-signalement', has_text='Problème de test').count() == 1)
    pg.locator('.mg-signalement', has_text='Problème de test').get_by_role('button', name='Résoudre').click()
    pg.locator('.mg-signalement input[required]').fill('Corrigé'); pg.get_by_role('button', name='Marquer résolu').click()
    verifier('résoudre un signalement', pg.locator('.mg-signalement', has_text='Problème de test').count() == 0)
    pg.locator('[data-ecran="1"]').click(); pg.wait_for_timeout(300)
    verifier('écran projets et réunions', pg.locator('.mg-kanban__col').count() >= 5 and pg.locator('.mg-odj li').count() >= 1)
    pg.locator('[data-ecran="2"]').click(); pg.wait_for_selector('.tb-bloc', timeout=8000)
    verifier('tableau de bord grist-graphique intégré', pg.locator('.tb-bloc').count() >= 3)
    pg.screenshot(path='/tmp/mg-tableau.png')
    pg.locator('[data-ecran="0"]').click()
    pg.get_by_role('button', name='Mode affichage').click()
    verifier('mode affichage : saisie masquée', not pg.locator('.mg-saisie').first.is_visible())
    pg.screenshot(path='/tmp/mg-affichage.png', full_page=True)
    # Aperçu réel : l'outil lui-même, avec les réglages non enregistrés
    pg.goto(URL); pg.wait_for_selector('.mg-grille')
    pg.locator('.cl-barre label', has_text='Réglages').click(); pg.wait_for_selector('#rg-rub')
    pg.fill('#rg-rub', 'Rubrique brouillon\nQualité de service\nDélais\nMoyens\nÉquipe')
    pg.locator('.cl-barre label', has_text='Aperçu').click(); pg.wait_for_timeout(600)
    verifier('aperçu réel : l\'outil est dans le cadre de l\'aperçu', pg.locator('.cl-apercu #mg-app .mg-grille').count() == 1)
    verifier('aperçu réel : les réglages non enregistrés s\'appliquent', 'Rubrique brouillon' in pg.locator('.cl-apercu #mg-app').inner_text())
    pg.locator('.cl-barre label').first.click(); pg.wait_for_timeout(600)
    verifier('aperçu quitté : l\'outil est revenu dans son onglet, réglages enregistrés rétablis', pg.locator('.cl-apercu #mg-app').count() == 0 and 'Rubrique brouillon' not in pg.locator('#mg-app').inner_text())
    verifier('aucune erreur JavaScript', not erreurs)
    if erreurs: print(erreurs)
    b.close()
print(f'{ok} réussis, {ko} échoués'); sys.exit(1 if ko else 0)

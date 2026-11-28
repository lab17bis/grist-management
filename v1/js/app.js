/*
 * grist-management – espace de management visuel d'équipe, widget-outil Grist au DSFR.
 *
 * Il assemble, dans un même document Grist, ce que produisent les autres outils :
 *   - tableaux de bord de grist-graphique (colonne Config_graphique d'une table) ;
 *   - réunions et actions de grist-reunion (tables Reunions, Points, Actions_reunion) ;
 *   - projets et actions de grist-projet (tables Projets, Actions, Personnes).
 * Il ajoute ce qui leur manque pour le management visuel :
 *   - la météo du jour (table Meteo) : chaque rubrique notée Conforme / À surveiller / Critique ;
 *   - les signalements de problèmes avec escalade (table Signalements) ;
 *   - un mode affichage pour écran de service : plein écran, rotation des écrans, actualisation.
 * Deux niveaux (réglage propre à chaque vue Grist, options niveauMg et equipeMg) :
 *   - Équipe : le rituel de l'équipe (priorités et points chauds, signalements, actions, charge vécue facultative,
 *     tension de charge qualifiée par le manager), filtré sur une équipe (colonne Equipe) ;
 *   - Pilotage : le point entre managers, qui ne reçoit que ce que les équipes escaladent (signalements, demandes
 *     d'arbitrage, tension de charge) et jamais de réponse individuelle d'agent (la table Charge n'y est pas lue).
 *
 * Hors de Grist (page ouverte directement), il charge des données fictives.
 */
(function () {
  'use strict';

  var NOM_COLONNE_CONFIG = 'Config_management';
  var STATUTS_METEO = [
    { nom: 'Conforme', code: 'vert', badge: 'success', symbole: '✓' },
    { nom: 'À surveiller', code: 'orange', badge: 'warning', symbole: '!' },
    { nom: 'Critique', code: 'rouge', badge: 'error', symbole: '✕' }
  ];
  // Couleurs des choix dans Grist (reprises par grist-graphique) : tokens DSFR « flat », texte blanc.
  var COULEURS_GRIST = {
    'Conforme': { fillColor: '#18753C', textColor: '#FFFFFF' }, 'À surveiller': { fillColor: '#B34000', textColor: '#FFFFFF' }, 'Critique': { fillColor: '#CE0500', textColor: '#FFFFFF' },
    'Bloquante': { fillColor: '#CE0500', textColor: '#FFFFFF' }, 'Majeure': { fillColor: '#B34000', textColor: '#FFFFFF' }, 'Mineure': { fillColor: '#0063CB', textColor: '#FFFFFF' }
  };
  var GRAVITES = ['Bloquante', 'Majeure', 'Mineure'];
  var COULEUR_GRAVITE = { 'Bloquante': 'error', 'Majeure': 'warning', 'Mineure': 'info' };
  var STATUTS_SIGNALEMENT = ['Ouvert', 'En cours', 'Résolu'];
  var NATURES = ['Problème', 'Demande d\'arbitrage'];
  var TYPES_PRIORITE = ['Point chaud', 'Priorité'];
  // Charge vécue (déclarée par chaque agent) et tension de charge (qualifiée par le manager pour le niveau Pilotage).
  var NIVEAUX_CHARGE = [
    { nom: 'Confortable', code: 'vert', symbole: '✓' }, { nom: 'Chargé', code: 'orange', symbole: '!' }, { nom: 'Débordé', code: 'rouge', symbole: '✕' }];
  var NIVEAUX_TENSION = [
    { nom: 'Normale', code: 'vert', symbole: '✓' }, { nom: 'Tendue', code: 'orange', symbole: '!' }, { nom: 'Critique', code: 'rouge', symbole: '✕' }];
  var DEFAUTS = {
    rubriques: ['Santé et sécurité', 'Qualité de service', 'Délais', 'Moyens', 'Équipe'],
    escalade: ['Équipe', 'Encadrement', 'Direction'],
    joursMeteo: 10, delaiSignalement: 5, rotation: 30,
    equipes: [], nomPilotage: 'Pilotage', semainesCharge: 6
  };
  var TYPES_ZONE = [
    ['synthese', 'Chiffres clés'], ['priorites', 'Priorités et points chauds'], ['meteo', 'Météo du jour'], ['signalements', 'Signalements'],
    ['actions', 'Actions à suivre'], ['charge', 'Charge vécue de l\'équipe'], ['tension', 'Tension de charge (pour le pilotage)'],
    ['escalades', 'Escalades et arbitrages (pilotage)'], ['tensions', 'Tension de charge des équipes (pilotage)'],
    ['reunion', 'Prochaine réunion'], ['projets', 'Projets par phase'],
    ['tableau', 'Tableau de bord grist-graphique'], ['texte', 'Message libre']
  ];
  var LARGEURS = [[4, 'Un tiers'], [6, 'Moitié'], [8, 'Deux tiers'], [12, 'Pleine largeur']];

  var PUBLIC = !!(window.GristPublic && window.GristPublic.actif);
  var DEMO = window.self === window.top && !PUBLIC;
  var C = {};              // configuration en vigueur
  var reglages = {};       // configuration enregistrée
  var meta = { tables: [], colonnes: [], colConfig: false };
  var data = {};
  var etat = { ecran: 0, alerte: null, affichage: false, resolution: null, brouillons: {}, tableaux: [] };
  // Niveau et équipe de cette vue Grist (options de la vue, pas du document) ; démonstration : ?niveau=pilotage&equipe=…
  var vue = { niveau: 'equipe', equipe: '' };
  var app = document.getElementById('mg-app');

  // ---------------------------------------------------------------------------
  // Utilitaires
  // ---------------------------------------------------------------------------

  function esc(v) {
    return String(v === null || v === undefined ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function num(v) { var n = parseInt(v, 10); return isNaN(n) ? 0 : n; }
  function aujourdhui() { var d = new Date(); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 1000; }
  function dateTexte(sec, o) { return sec ? new Date(sec * 1000).toLocaleDateString('fr-FR', Object.assign({ timeZone: 'UTC' }, o || {})) : ''; }
  function saisieVersDate(t) { var p = String(t || '').split('-'); return p.length === 3 ? Date.UTC(+p[0], +p[1] - 1, +p[2]) / 1000 : null; }
  function badge(t, c) { return t ? '<span class="fr-badge fr-badge--sm fr-badge--no-icon' + (c ? ' fr-badge--' + c : '') + '">' + esc(t) + '</span>' : ''; }
  function enLignes(cols) { var ids = cols.id || [], k = Object.keys(cols); return ids.map(function (_, i) { var o = {}; k.forEach(function (c) { o[c] = cols[c][i]; }); return o; }); }
  function liste(v) { return Array.isArray(v) ? (v[0] === 'L' ? v.slice(1) : v) : []; }
  function joursEntre(a, b) { return Math.floor((b - a) / 86400); }
  // Lundi de la semaine d'une date (secondes UTC à minuit).
  function lundi(sec) { var j = new Date(sec * 1000).getUTCDay(); return sec - ((j + 6) % 7) * 86400; }
  function pilotage() { return vue.niveau === 'pilotage'; }
  // Une ligne sans équipe vaut pour toutes ; au niveau Pilotage, toutes les équipes sont montrées.
  function dansEquipe(l) { return pilotage() || !vue.equipe || !l.Equipe || l.Equipe === vue.equipe; }
  function niveau(liste, nom) { return liste.filter(function (x) { return x.nom === nom; })[0] || null; }

  function aTable(t) { return meta.tables.some(function (x) { return x.tableId === t; }); }
  function colonnesDe(t) {
    var tb = meta.tables.filter(function (x) { return x.tableId === t; })[0];
    return tb ? meta.colonnes.filter(function (c) { return c.parentId === tb.id; }) : [];
  }
  function aColonne(t, c) { return colonnesDe(t).some(function (x) { return x.colId === c; }); }
  function choixDe(t, c) {
    var col = colonnesDe(t).filter(function (x) { return x.colId === c; })[0];
    try { return (JSON.parse(col.widgetOptions || '{}').choices) || []; } catch (e) { return []; }
  }

  // Ce que contient le document : chaque zone ne s'affiche que si sa source existe.
  function sources() {
    return {
      meteo: aTable('Meteo'),
      signalements: aTable('Signalements'),
      reunions: aTable('Reunions') && aTable('Points'),
      actionsReunion: aTable('Actions_reunion'),
      projets: aTable('Projets') && aColonne('Projets', 'Phase'),
      actionsProjet: aTable('Actions') && aColonne('Actions', 'Projet'),
      priorites: aTable('Priorites'),
      charge: aTable('Charge') && C.charge === true,
      tensions: aTable('Tensions_charge'),
      equipes: aColonne('Signalements', 'Equipe'),
      tableaux: etat.tableaux
    };
  }

  // Tableaux de bord grist-graphique trouvés dans le document.
  function listerTableaux() {
    var res = [];
    meta.colonnes.filter(function (c) { return c.colId === 'Config_graphique'; }).forEach(function (c) {
      var t = meta.tables.filter(function (x) { return x.id === c.parentId; })[0];
      var conf = null;
      try { conf = JSON.parse(c.description || 'null'); } catch (e) { conf = null; }
      ((conf && conf.tableaux) || []).forEach(function (tb, i) {
        res.push({ cle: t.tableId + ':' + (tb.id || i), hote: t.tableId, index: i, titre: tb.titre || ('Tableau ' + (i + 1)) });
      });
    });
    return res;
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  function appliquerReglages(r) {
    reglages = r || {};
    C = Object.assign({}, DEFAUTS, reglages);
    ['rubriques', 'escalade'].forEach(function (k) { if (!Array.isArray(C[k]) || !C[k].length) C[k] = DEFAUTS[k]; });
    var page = Object.assign({ marque: '', titre: 'Management visuel', pied: { accessibilite: '' } }, reglages.page || {});
    if (window.PageDSFR) {
      var cible = window.PageDSFR.appliquer(page, { entete: document.getElementById('entete'), pied: document.getElementById('pied'), accueil: '#' });
      cible.entete.id = 'entete'; cible.pied.id = 'pied';
    }
  }

  // Composition automatique des écrans selon les sources présentes.
  function ecransAuto() {
    var s = sources(), e = [];
    if (pilotage()) {
      var zp = [{ type: 'synthese', largeur: 12 }];
      if (s.signalements) zp.push({ type: 'escalades', largeur: s.tensions ? 7 : 12 });
      if (s.tensions) zp.push({ type: 'tensions', largeur: s.signalements ? 5 : 12 });
      if (s.actionsReunion || s.actionsProjet) zp.push({ type: 'actions', largeur: 12 });
      e.push({ titre: 'Pilotage', zones: zp });
      if (s.projets) e.push({ titre: 'Projets', zones: [{ type: 'projets', largeur: 12 }] });
      s.tableaux.slice(0, 3).forEach(function (t) { e.push({ titre: t.titre, zones: [{ type: 'tableau', largeur: 12, tableau: t.cle }] }); });
      return e;
    }
    var z1 = [{ type: 'synthese', largeur: 12 }];
    if (s.priorites) z1.push({ type: 'priorites', largeur: 12 });
    var meteo = s.meteo && C.meteo !== false;
    if (meteo) z1.push({ type: 'meteo', largeur: 7 });
    if (s.signalements) z1.push({ type: 'signalements', largeur: meteo ? 5 : 12 });
    if (s.actionsReunion || s.actionsProjet) z1.push({ type: 'actions', largeur: 12 });
    e.push({ titre: "Aujourd'hui", zones: z1 });
    var zc = [];
    if (s.charge) zc.push({ type: 'charge', largeur: s.tensions ? 7 : 12 });
    if (s.tensions) zc.push({ type: 'tension', largeur: s.charge ? 5 : 12 });
    if (zc.length) e.push({ titre: 'Charge de travail', zones: zc });
    var z2 = [];
    if (s.reunions) z2.push({ type: 'reunion', largeur: s.projets ? 4 : 12 });
    if (s.projets) z2.push({ type: 'projets', largeur: s.reunions ? 8 : 12 });
    if (z2.length) e.push({ titre: 'Projets et réunions', zones: z2 });
    s.tableaux.slice(0, 3).forEach(function (t) { e.push({ titre: t.titre, zones: [{ type: 'tableau', largeur: 12, tableau: t.cle }] }); });
    return e;
  }
  // Les écrans composés à la main sont propres à chaque niveau : ecrans (Équipe) et ecransPilotage (Pilotage).
  function cleEcrans() { return pilotage() ? 'ecransPilotage' : 'ecrans'; }
  var ZONES_PRIVEES = ['charge', 'tension', 'tensions'];
  function ecrans() {
    var e = C[cleEcrans()];
    e = Array.isArray(e) && e.length ? e : ecransAuto();
    if (!PUBLIC) return e;
    // Page publique : jamais la charge vécue ni la tension de charge, même si un écran les contient.
    return e.map(function (x) { return Object.assign({}, x, { zones: (x.zones || []).filter(function (z) { return ZONES_PRIVEES.indexOf(z.type) < 0; }) }); })
      .filter(function (x) { return x.zones.length; });
  }
  function versReglages(b) {
    var r = JSON.parse(JSON.stringify(b));
    if (pilotage()) {
      r.ecransPilotage = r.ecrans;
      if (Array.isArray((reglages || {}).ecrans)) r.ecrans = JSON.parse(JSON.stringify(reglages.ecrans)); else delete r.ecrans;
    }
    return r;
  }

  // ---------------------------------------------------------------------------
  // Chargement
  // ---------------------------------------------------------------------------

  var TABLES_LUES = ['Meteo', 'Signalements', 'Reunions', 'Points', 'Actions_reunion', 'Projets', 'Actions', 'Personnes', 'Priorites', 'Tensions_charge', 'Charge'];
  // Tables jamais lues : la charge vécue au niveau Pilotage (réponses individuelles) ; charge et tension sur une page publique.
  function tableLue(t) {
    if (t === 'Charge') return !PUBLIC && !pilotage() && C.charge === true;
    if (t === 'Tensions_charge') return !PUBLIC;
    return true;
  }

  var vueDemoLue = false;
  function chargerDemo() {
    return fetch('exemples/demo.json').then(function (r) { return r.json(); }).then(function (j) {
      var auj = aujourdhui();
      meta.tables = []; meta.colonnes = [];
      Object.keys(j.tables).forEach(function (t, i) {
        meta.tables.push({ id: i + 1, tableId: t });
        (j.choix && j.choix[t] ? Object.keys(j.choix[t]) : []).forEach(function (c) {
          meta.colonnes.push({ parentId: i + 1, colId: c, widgetOptions: JSON.stringify({ choices: j.choix[t][c] }) });
        });
        Object.keys((j.tables[t][0] || {})).forEach(function (c) { if (!meta.colonnes.some(function (x) { return x.parentId === i + 1 && x.colId === c; })) meta.colonnes.push({ parentId: i + 1, colId: c }); });
        data[t] = j.tables[t].map(function (l) {
          var o = Object.assign({}, l);
          Object.keys(o).forEach(function (k) {
            if (typeof o[k] === 'string' && /^J[+-]\d+$/.test(o[k])) o[k] = auj + 86400 * (+o[k].slice(1));
            else if (typeof o[k] === 'string' && /^S-\d+$/.test(o[k])) o[k] = lundi(auj) - 7 * 86400 * (+o[k].slice(2));
          });
          return o;
        });
      });
      appliquerReglages({ page: { titre: 'Management visuel', sousTitre: 'Démonstration' } });
      etat.tableaux = [{ cle: 'demo:0', hote: 'demo', index: 0, titre: 'Activité (grist-graphique)' }];
      if (!vueDemoLue) {
        var q = new URLSearchParams(location.search); vueDemoLue = true;
        vue = { niveau: q.get('niveau') === 'pilotage' ? 'pilotage' : 'equipe', equipe: q.get('equipe') || (q.get('niveau') === 'pilotage' ? '' : 'Accueil') };
      }
      appliquerReglages({ page: { titre: pilotage() ? 'Pilotage' : 'Management visuel', sousTitre: 'Démonstration' }, equipes: ['Accueil', 'Gestion'], charge: true, meteo: true });
      if (pilotage()) data.Charge = [];
    });
  }

  function chargerGrist() {
    return Promise.all([grist.docApi.fetchTable('_grist_Tables'), grist.docApi.fetchTable('_grist_Tables_column')]).then(function (m) {
      meta.tables = enLignes(m[0]).filter(function (t) { return !/^_grist/.test(t.tableId); });
      meta.colonnes = enLignes(m[1]);
      var c = colonnesDe('Meteo').filter(function (x) { return x.colId === NOM_COLONNE_CONFIG; })[0];
      meta.colConfig = !!c;
      var r = {};
      try { r = c && c.description ? JSON.parse(c.description) : {}; } catch (e) { r = {}; }
      appliquerReglages(r);
      etat.tableaux = listerTableaux();
      return lireVue();
    }).then(function () {
      TABLES_LUES.forEach(function (t) { if (!tableLue(t)) data[t] = []; });
      return Promise.all(TABLES_LUES.filter(aTable).filter(tableLue).map(function (t) {
        return grist.docApi.fetchTable(t).then(function (x) { data[t] = enLignes(x); }).catch(function () { data[t] = []; });
      }));
    });
  }

  function charger() { return DEMO ? chargerDemo() : chargerGrist(); }
  // Niveau et équipe de la vue : options de la vue Grist (comme l'affichage éditeur ou page d'usage).
  function lireVue() {
    if (PUBLIC || typeof grist.getOption !== 'function') return Promise.resolve();
    return Promise.all([grist.getOption('niveauMg'), grist.getOption('equipeMg')]).then(function (v) {
      vue = { niveau: v[0] === 'pilotage' ? 'pilotage' : 'equipe', equipe: v[1] || '' };
    }).catch(function () { /* options illisibles : niveau Équipe, toutes équipes */ });
  }
  function choisirVue(niveauChoisi, equipe) {
    vue = { niveau: niveauChoisi === 'pilotage' ? 'pilotage' : 'equipe', equipe: niveauChoisi === 'pilotage' ? '' : (equipe || '') };
    if (DEMO || typeof grist.setOption !== 'function') return Promise.resolve(false);
    return Promise.all([grist.setOption('niveauMg', vue.niveau === 'pilotage' ? 'pilotage' : null), grist.setOption('equipeMg', vue.equipe || null)]).then(function () { return true; });
  }

  // ---------------------------------------------------------------------------
  // Écritures
  // ---------------------------------------------------------------------------

  function ecrire(actions) {
    if (!DEMO) return grist.docApi.applyUserActions(actions);
    actions.forEach(function (a) {
      var t = a[1];
      data[t] = data[t] || [];
      if (a[0] === 'AddRecord') {
        var id = data[t].reduce(function (m, l) { return Math.max(m, l.id); }, 0) + 1;
        var l = Object.assign({ id: id }, a[3]);
        if (t === 'Signalements') { l.Signale_par = 'Vous (démonstration)'; l.Signale_le = Date.now() / 1000; }
        if (t === 'Priorites') l.Publie_par = 'Vous (démonstration)';
        if (t === 'Tensions_charge') l.Qualifie_par = 'Vous (démonstration)';
        if (t === 'Charge') {
          // Comme la colonne Retenue de Grist : seule la dernière réponse de la personne, dans la semaine, compte.
          data[t].forEach(function (x) { if (x.Saisi_par === 'vous' && x.Semaine === l.Semaine && x.Equipe === l.Equipe) x.Retenue = false; });
          l.Saisi_par = 'vous'; l.Nom = 'Vous'; l.Retenue = true;
        }
        data[t].push(l);
      } else if (a[0] === 'UpdateRecord') {
        Object.assign(data[t].filter(function (l) { return l.id === a[2]; })[0] || {}, a[3]);
      }
    });
    return Promise.resolve();
  }
  function executer(actions, message) {
    return ecrire(actions).then(function () {
      etat.alerte = message ? { type: 'success', texte: message } : null;
      return DEMO ? null : charger();
    }).then(rendre).catch(function (err) {
      etat.alerte = { type: 'error', texte: 'Enregistrement refusé par Grist. Vérifiez vos droits sur le document. (' + ((err && err.message) || err) + ')' };
      rendre();
    });
  }

  // ---------------------------------------------------------------------------
  // Données métier
  // ---------------------------------------------------------------------------

  function joursAffiches() {
    var res = [], d = aujourdhui(), n = Math.max(3, Math.min(31, num(C.joursMeteo) || 10)), garde = 0;
    while (res.length < n && garde++ < 80) {
      var j = new Date(d * 1000).getUTCDay();
      if (C.weekend || (j !== 0 && j !== 6)) res.unshift(d);
      d -= 86400;
    }
    return res;
  }
  function meteoDu(jour, rubrique) {
    var l = (data.Meteo || []).filter(function (m) { return m.Date === jour && m.Rubrique === rubrique && dansEquipe(m); });
    // Avec des équipes, la ligne de l'équipe passe avant une ligne commune.
    return l.filter(function (m) { return vue.equipe && m.Equipe === vue.equipe; })[0] || l[0] || null;
  }
  function statutMeteo(nom) { return STATUTS_METEO.filter(function (s) { return s.nom === nom; })[0] || null; }

  function signalementsOuverts() {
    return (data.Signalements || []).filter(function (s) { return s.Statut !== 'Résolu' && dansEquipe(s); }).sort(function (a, b) {
      var g = GRAVITES.indexOf(a.Gravite) - GRAVITES.indexOf(b.Gravite);
      return g || (a.Signale_le || 0) - (b.Signale_le || 0);
    });
  }
  function ageSignalement(s) { return s.Signale_le ? Math.max(0, Math.floor((Date.now() / 1000 - s.Signale_le) / 86400)) : 0; }

  // Actions des deux outils, ramenées à un même format.
  function toutesActions() {
    var res = [], s = sources();
    if (s.actionsReunion) {
      var reu = {}; (data.Reunions || []).forEach(function (r) { reu[r.id] = r; });
      (data.Actions_reunion || []).forEach(function (a) {
        var r = reu[num(a.Reunion)];
        if (!dansEquipe(a)) return;
        res.push({ table: 'Actions_reunion', id: a.id, source: 'Réunion', origine: r ? r.Titre + (r.Date ? ' du ' + dateTexte(r.Date) : '') : (a.Equipe ? 'Point d\'équipe ' + a.Equipe : 'Point d\'équipe'), intitule: a.Intitule,
          responsable: a.Responsable || '', echeance: a.Echeance || null, etat: a.Etat || '', etats: choixDe('Actions_reunion', 'Etat') });
      });
    }
    if (s.actionsProjet) {
      var pers = {}, proj = {};
      (data.Personnes || []).forEach(function (p) { pers[p.id] = p.Nom; });
      (data.Projets || []).forEach(function (p) { proj[p.id] = p.Titre; });
      (data.Actions || []).forEach(function (a) {
        res.push({ table: 'Actions', id: a.id, source: 'Projet', origine: proj[num(a.Projet)] || '', intitule: a.Intitule,
          responsable: pers[num(a.Responsable)] || '', echeance: a.Fin || null, etat: a.Etat || '', etats: choixDe('Actions', 'Etat') });
      });
    }
    return res.filter(function (a) { return a.etat !== 'Fait' && a.etat !== 'Abandonné' && a.etat !== 'Terminé'; })
      .sort(function (a, b) { return (a.echeance || 9e12) - (b.echeance || 9e12); });
  }

  // Priorités et points chauds publiés par le manager, en cours aujourd'hui.
  function prioritesActives() {
    var auj = aujourdhui();
    return (data.Priorites || []).filter(function (p) { return dansEquipe(p) && (!p.Debut || p.Debut <= auj) && (!p.Fin || p.Fin >= auj); })
      .sort(function (a, b) { return TYPES_PRIORITE.indexOf(a.Type) - TYPES_PRIORITE.indexOf(b.Type) || (num(a.Ordre) - num(b.Ordre)) || a.id - b.id; });
  }
  // Charge vécue : seules les réponses retenues (la dernière de chaque personne, chaque semaine) comptent.
  function chargeSemaine(sem) {
    return (data.Charge || []).filter(function (c) { return c.Semaine === sem && c.Retenue !== false && dansEquipe(c) && (!vue.equipe || c.Equipe === vue.equipe || !c.Equipe); });
  }
  // Tension de charge qualifiée par le manager : la dernière de chaque équipe et chaque semaine.
  function tensionDe(equipe, sem) {
    return (data.Tensions_charge || []).filter(function (t) { return t.Semaine === sem && (t.Equipe || '') === (equipe || ''); })
      .sort(function (a, b) { return b.id - a.id; })[0] || null;
  }
  function equipesConnues() {
    var l = (C.equipes || []).slice();
    (data.Tensions_charge || []).concat(data.Signalements || []).forEach(function (x) { if (x.Equipe && l.indexOf(x.Equipe) < 0) l.push(x.Equipe); });
    return l;
  }
  // Au niveau Pilotage : ce que les équipes escaladent (au-delà du premier niveau) et les demandes d'arbitrage.
  function escalades() {
    return signalementsOuverts().filter(function (s) { return C.escalade.indexOf(s.Escalade) > 0 || s.Nature === NATURES[1]; });
  }

  function prochaineReunion(instance) {
    var auj = aujourdhui();
    return (data.Reunions || []).filter(function (r) {
      return r.Date && r.Date >= auj && (!instance || r.Instance === instance);
    }).sort(function (a, b) { return a.Date - b.Date || String(a.Heure).localeCompare(String(b.Heure)); })[0] || null;
  }

  // ---------------------------------------------------------------------------
  // Zones
  // ---------------------------------------------------------------------------

  function zoneSynthese() {
    var s = sources(), auj = aujourdhui(), ch = [];
    if (pilotage()) {
      if (s.signalements) {
        var es = escalades(), arb = es.filter(function (x) { return x.Nature === NATURES[1]; }).length;
        ch.push({ n: es.length - arb, lib: 'signalement' + (es.length - arb > 1 ? 's' : '') + ' escaladé' + (es.length - arb > 1 ? 's' : ''), statut: es.some(function (x) { return x.Gravite === 'Bloquante'; }) ? 'rouge' : es.length - arb ? 'orange' : 'vert' });
        ch.push({ n: arb, lib: 'demande' + (arb > 1 ? 's' : '') + ' d\'arbitrage', statut: arb ? 'orange' : 'vert' });
      }
      if (s.tensions) {
        var sem = lundi(auj), crit = equipesConnues().filter(function (e) { var t = tensionDe(e, sem); return t && t.Tension === 'Critique'; }).length;
        var sans = equipesConnues().filter(function (e) { return !tensionDe(e, sem); }).length;
        ch.push({ n: crit, lib: 'équipe' + (crit > 1 ? 's' : '') + ' en tension critique', statut: crit ? 'rouge' : 'vert' });
        if (sans) ch.push({ n: sans, lib: 'équipe' + (sans > 1 ? 's' : '') + ' sans tension qualifiée cette semaine', statut: 'orange' });
      }
    } else if (s.priorites) {
      var pa = prioritesActives(), chauds = pa.filter(function (p) { return p.Type === TYPES_PRIORITE[0]; }).length;
      ch.push({ n: chauds, lib: 'point' + (chauds > 1 ? 's' : '') + ' chaud' + (chauds > 1 ? 's' : ''), statut: chauds ? 'orange' : 'vert' });
    }
    if (s.meteo && !pilotage() && C.meteo !== false) {
      var crit = C.rubriques.filter(function (r) { var m = meteoDu(auj, r); return m && m.Statut === 'Critique'; }).length;
      var non = C.rubriques.filter(function (r) { return !meteoDu(auj, r); }).length;
      ch.push({ n: crit, lib: 'rubrique' + (crit > 1 ? 's' : '') + ' en critique aujourd\'hui', statut: crit ? 'rouge' : 'vert' });
      if (non) ch.push({ n: non, lib: 'rubrique' + (non > 1 ? 's' : '') + ' sans météo aujourd\'hui', statut: 'orange' });
    }
    if (s.signalements && !pilotage()) {
      var ouv = signalementsOuverts(), retard = ouv.filter(function (x) { return ageSignalement(x) > num(C.delaiSignalement); }).length;
      ch.push({ n: ouv.length, lib: 'signalement' + (ouv.length > 1 ? 's' : '') + ' ouvert' + (ouv.length > 1 ? 's' : ''), statut: ouv.some(function (x) { return x.Gravite === 'Bloquante'; }) ? 'rouge' : ouv.length ? 'orange' : 'vert' });
      if (retard) ch.push({ n: retard, lib: 'hors délai de résolution', statut: 'rouge' });
    }
    if (s.actionsReunion || s.actionsProjet) {
      var acts = toutesActions(), r = acts.filter(function (a) { return a.echeance && a.echeance < auj; }).length;
      ch.push({ n: r, lib: 'action' + (r > 1 ? 's' : '') + ' en retard', statut: r ? 'rouge' : 'vert' });
      ch.push({ n: acts.length, lib: 'action' + (acts.length > 1 ? 's' : '') + ' ouverte' + (acts.length > 1 ? 's' : ''), statut: '' });
    }
    if (s.reunions) {
      var p = prochaineReunion();
      if (p) { var j = joursEntre(auj, p.Date); ch.push({ n: j === 0 ? 'Auj.' : j === 1 ? 'Demain' : 'J-' + j, lib: 'prochaine réunion', statut: '' }); }
    }
    if (!ch.length) return '<p class="mg-vide">Aucune source de données. Installez la météo et les signalements, ou ajoutez les outils grist-reunion et grist-projet à ce document.</p>';
    return '<ul class="mg-chiffres">' + ch.map(function (c) {
      return '<li class="mg-chiffre' + (c.statut ? ' mg-statut--' + c.statut : '') + '"><span class="mg-chiffre__n">' + esc(c.n) + '</span><span class="mg-chiffre__lib">' + esc(c.lib) + '</span></li>';
    }).join('') + '</ul>';
  }

  function zoneMeteo() {
    var jours = joursAffiches(), auj = aujourdhui();
    var h = '<div class="mg-meteo-defil"><table class="mg-meteo"><caption class="fr-sr-only">Météo des ' + jours.length + ' derniers jours par rubrique</caption><thead><tr><th scope="col">Rubrique</th>' +
      jours.map(function (j) { return '<th scope="col"' + (j === auj ? ' class="mg-meteo__auj"' : '') + '>' + (j === auj ? 'Auj.' : esc(dateTexte(j, { weekday: 'short', day: 'numeric' }))) + '</th>'; }).join('') + '</tr></thead><tbody>';
    C.rubriques.forEach(function (r) {
      h += '<tr><th scope="row">' + esc(r) + '</th>' + jours.map(function (j) {
        var m = meteoDu(j, r), s = m && statutMeteo(m.Statut);
        var info = s ? s.nom + (m.Commentaire ? ' : ' + m.Commentaire : '') : 'Non renseigné';
        return '<td class="mg-meteo__case' + (s ? ' mg-statut--' + s.code : '') + (j === auj ? ' mg-meteo__auj' : '') + '" title="' + esc(info) + '">' +
          '<span aria-hidden="true">' + (s ? s.symbole : '·') + '</span><span class="fr-sr-only">' + esc(dateTexte(j)) + ' : ' + esc(info) + '</span></td>';
      }).join('') + '</tr>';
    });
    h += '</tbody></table></div><p class="mg-legende" aria-hidden="true">' + STATUTS_METEO.map(function (s) { return '<span class="mg-legende__el"><span class="mg-pastille mg-statut--' + s.code + '">' + s.symbole + '</span> ' + esc(s.nom) + '</span>'; }).join('') + '</p>';
    // Commentaires du jour sur les rubriques non conformes.
    var alertes = C.rubriques.map(function (r) { return meteoDu(auj, r); }).filter(function (m) { return m && m.Statut !== 'Conforme' && m.Commentaire; });
    if (alertes.length) h += '<ul class="mg-commentaires">' + alertes.map(function (m) { return '<li>' + badge(m.Statut, statutMeteo(m.Statut).badge) + ' <strong>' + esc(m.Rubrique) + '</strong> : ' + esc(m.Commentaire) + '</li>'; }).join('') + '</ul>';
    // Saisie du jour.
    h += '<details class="mg-saisie fr-mt-2w"' + (etat.saisieOuverte ? ' open' : '') + '><summary>Renseigner la météo du jour</summary><form data-form="meteo" class="fr-mt-2w">';
    C.rubriques.forEach(function (r, i) {
      var m = meteoDu(auj, r);
      h += '<fieldset class="fr-fieldset mg-meteo-saisie"><legend class="fr-fieldset__legend fr-text--bold">' + esc(r) + '</legend>' +
        STATUTS_METEO.map(function (s, k) {
          return '<div class="fr-fieldset__element fr-fieldset__element--inline"><div class="fr-radio-group fr-radio-group--sm"><input type="radio" id="mt-' + i + '-' + k + '" name="mt-' + i + '" value="' + esc(s.nom) + '"' + (m && m.Statut === s.nom ? ' checked' : '') + '><label class="fr-label" for="mt-' + i + '-' + k + '">' + esc(s.nom) + '</label></div></div>';
        }).join('') +
        '<div class="fr-fieldset__element"><label class="fr-label fr-sr-only" for="mtc-' + i + '">Commentaire pour ' + esc(r) + '</label><input class="fr-input" id="mtc-' + i + '" placeholder="Commentaire (facultatif)" value="' + esc(m ? m.Commentaire || '' : '') + '"></div></fieldset>';
    });
    h += '<button type="submit" class="fr-btn">Enregistrer la météo du jour</button></form></details>';
    return h;
  }

  function zoneSignalements(z, auPilotage) {
    var ouv = auPilotage ? escalades() : signalementsOuverts(), delai = num(C.delaiSignalement);
    var h = '';
    if (!ouv.length) h += '<p class="mg-vide">' + (auPilotage ? 'Aucun signalement escaladé ni demande d\'arbitrage en attente.' : 'Aucun signalement ouvert.') + '</p>';
    else h += '<ul class="mg-signalements">' + ouv.slice(0, 12).map(function (s) {
      var age = ageSignalement(s), horsDelai = delai && age > delai;
      var niv = C.escalade.indexOf(s.Escalade);
      h = '<li class="mg-signalement mg-gravite--' + (COULEUR_GRAVITE[s.Gravite] || 'info') + '"><p class="mg-signalement__titre">' + esc(s.Titre) + '</p>' +
        '<p class="mg-signalement__meta">' + (s.Nature === NATURES[1] ? badge('Arbitrage', 'purple-glycine') + ' ' : '') + (pilotage() && s.Equipe ? badge(s.Equipe, 'blue-ecume') + ' ' : '') + badge(s.Gravite, COULEUR_GRAVITE[s.Gravite]) + ' ' + badge(s.Statut, s.Statut === 'En cours' ? 'info' : '') + ' ' + (s.Rubrique ? badge(s.Rubrique) : '') +
        (niv > 0 ? ' ' + badge('Escaladé : ' + s.Escalade, 'new') : '') + '</p>' +
        '<p class="mg-signalement__info">Ouvert depuis ' + age + ' jour' + (age > 1 ? 's' : '') + (horsDelai ? ' · <strong class="mg-texte-erreur">délai de ' + delai + ' jours dépassé</strong>' : '') +
        (s.Responsable ? ' · suivi par ' + esc(s.Responsable) : '') + '</p>';
      if (etat.resolution === s.id) {
        h += '<form data-form="resoudre" data-id="' + s.id + '" class="mg-saisie">' +
          '<div class="fr-input-group"><label class="fr-label" for="res-' + s.id + '">' + (s.Nature === NATURES[1] ? 'Quel arbitrage a été rendu ?' : 'Comment le problème a-t-il été résolu ?') + '</label><input class="fr-input" id="res-' + s.id + '" required></div>' +
          '<ul class="fr-btns-group fr-btns-group--inline fr-btns-group--sm"><li><button class="fr-btn" type="submit">Marquer résolu</button></li><li><button class="fr-btn fr-btn--secondary" type="button" data-action="annuler-resolution">Annuler</button></li></ul></form>';
      } else {
        h += '<ul class="fr-btns-group fr-btns-group--inline fr-btns-group--sm mg-saisie">' +
          (s.Statut !== 'En cours' ? '<li><button type="button" class="fr-btn fr-btn--secondary" data-signalement="' + s.id + '" data-faire="encours">Prendre en charge</button></li>' : '') +
          (niv < C.escalade.length - 1 ? '<li><button type="button" class="fr-btn fr-btn--tertiary" data-signalement="' + s.id + '" data-faire="escalader">Escalader à : ' + esc(C.escalade[niv + 1]) + '</button></li>' : '') +
          '<li><button type="button" class="fr-btn fr-btn--tertiary" data-signalement="' + s.id + '" data-faire="resoudre">Résoudre</button></li></ul>';
      }
      return h + '</li>';
    }).join('') + '</ul>';
    if (ouv.length > 12) h += '<p class="fr-text--sm">Et ' + (ouv.length - 12) + ' autre(s).</p>';
    if (auPilotage) return h;
    var b = etat.brouillons.sig || {};
    var nature = aColonne('Signalements', 'Nature') || DEMO ? '<div class="fr-select-group"><label class="fr-label" for="sg-nat">Nature</label><select class="fr-select" id="sg-nat" data-sig="Nature">' +
      NATURES.map(function (n) { return '<option' + ((b.Nature || NATURES[0]) === n ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('') + '</select></div>' : '';
    h += '<details class="mg-saisie fr-mt-2w"><summary>Signaler un problème</summary><form data-form="signalement" class="fr-mt-2w">' +
      nature + '<div class="fr-input-group"><label class="fr-label" for="sg-titre">Problème constaté ou décision attendue</label><input class="fr-input" id="sg-titre" data-sig="Titre" value="' + esc(b.Titre || '') + '" required></div>' +
      '<div class="mg-deux"><div class="fr-select-group"><label class="fr-label" for="sg-rub">Rubrique</label><select class="fr-select" id="sg-rub" data-sig="Rubrique">' + C.rubriques.map(function (r) { return '<option' + (b.Rubrique === r ? ' selected' : '') + '>' + esc(r) + '</option>'; }).join('') + '</select></div>' +
      '<div class="fr-select-group"><label class="fr-label" for="sg-grav">Gravité</label><select class="fr-select" id="sg-grav" data-sig="Gravite">' + GRAVITES.slice().reverse().map(function (g) { return '<option' + ((b.Gravite || 'Mineure') === g ? ' selected' : '') + '>' + esc(g) + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="fr-input-group"><label class="fr-label" for="sg-desc">Précisions (facultatif)</label><textarea class="fr-input" id="sg-desc" rows="2" data-sig="Description">' + esc(b.Description || '') + '</textarea></div>' +
      '<button type="submit" class="fr-btn">Signaler</button></form></details>';
    return h;
  }

  function zonePriorites() {
    var l = prioritesActives(), b = etat.brouillons.prio || {};
    var h = !l.length ? '<p class="mg-vide">Aucune priorité ni point chaud publiés' + (vue.equipe ? ' pour l\'équipe ' + esc(vue.equipe) : '') + '.</p>' :
      '<ul class="mg-priorites">' + l.map(function (p) {
        var chaud = p.Type === TYPES_PRIORITE[0];
        return '<li class="mg-priorite' + (chaud ? ' mg-priorite--chaud' : '') + '"><p class="mg-priorite__titre">' + badge(p.Type || TYPES_PRIORITE[1], chaud ? 'warning' : 'info') + ' ' + esc(p.Titre) + '</p>' +
          (p.Detail ? '<p class="mg-priorite__detail">' + esc(p.Detail) + '</p>' : '') +
          '<p class="mg-action__meta">' + (p.Fin ? 'Jusqu\'au ' + esc(dateTexte(p.Fin)) : 'Sans date de fin') + (p.Publie_par ? ' · publié par ' + esc(p.Publie_par) : '') + (pilotage() && p.Equipe ? ' · ' + esc(p.Equipe) : '') + '</p>' +
          '<ul class="fr-btns-group fr-btns-group--inline fr-btns-group--sm mg-saisie"><li><button type="button" class="fr-btn fr-btn--tertiary" data-priorite="' + p.id + '">Retirer</button></li></ul></li>';
      }).join('') + '</ul>';
    h += '<details class="mg-saisie fr-mt-2w"><summary>Publier une priorité ou un point chaud</summary><form data-form="priorite" class="fr-mt-2w">' +
      '<div class="mg-deux"><div class="fr-select-group"><label class="fr-label" for="pr-type">Type</label><select class="fr-select" id="pr-type" data-prio="Type">' +
      TYPES_PRIORITE.map(function (t) { return '<option' + ((b.Type || TYPES_PRIORITE[1]) === t ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select></div>' +
      '<div class="fr-input-group"><label class="fr-label" for="pr-fin">Jusqu\'au (facultatif)</label><input class="fr-input" type="date" id="pr-fin" data-prio="Fin" value="' + esc(b.Fin || '') + '"></div></div>' +
      '<div class="fr-input-group"><label class="fr-label" for="pr-titre">Intitulé</label><input class="fr-input" id="pr-titre" data-prio="Titre" value="' + esc(b.Titre || '') + '" required></div>' +
      '<div class="fr-input-group"><label class="fr-label" for="pr-detail">Précisions (facultatif)</label><textarea class="fr-input" id="pr-detail" rows="2" data-prio="Detail">' + esc(b.Detail || '') + '</textarea></div>' +
      '<button type="submit" class="fr-btn">Publier</button></form></details>';
    return h;
  }

  // Répartition des réponses d'une semaine ; les réponses ne sont jamais montrées avec leur auteur, sauf choix de l'agent.
  function repartitionCharge(lignes) {
    var total = lignes.length;
    return '<ul class="mg-repartition">' + NIVEAUX_CHARGE.map(function (n) {
      var k = lignes.filter(function (c) { return c.Niveau === n.nom; }).length, pc = total ? Math.round(100 * k / total) : 0;
      return '<li class="mg-repartition__el"><span class="mg-pastille mg-statut--' + n.code + '" aria-hidden="true">' + n.symbole + '</span> <strong>' + esc(n.nom) + '</strong> : ' + k +
        '<span class="mg-barre-pc" aria-hidden="true"><span class="mg-statut--' + n.code + '" style="width:' + pc + '%"></span></span></li>';
    }).join('') + '</ul>';
  }
  function zoneCharge() {
    var auj = aujourdhui(), sem = lundi(auj), l = chargeSemaine(sem), b = etat.brouillons.charge || {};
    var h = '<p class="fr-text--sm">Semaine du ' + esc(dateTexte(sem, { day: 'numeric', month: 'long' })) + ' · ' + l.length + ' réponse' + (l.length > 1 ? 's' : '') + '. Ce relevé sert à ouvrir la discussion sur la charge pendant le point d\'équipe, pas à mesurer.</p>';
    h += l.length ? repartitionCharge(l) : '<p class="mg-vide">Pas encore de réponse cette semaine.</p>';
    var raisons = l.filter(function (c) { return c.Raison; });
    if (raisons.length) h += '<h3 class="fr-h6">Ce qui pèse</h3><ul class="mg-commentaires">' + raisons.map(function (c) {
      var n = niveau(NIVEAUX_CHARGE, c.Niveau);
      return '<li>' + (n ? badge(n.nom, n.code === 'rouge' ? 'error' : n.code === 'orange' ? 'warning' : 'success') + ' ' : '') + esc(c.Raison) + (c.Nominatif && c.Nom ? ' <span class="mg-gris">(' + esc(c.Nom) + ')</span>' : '') + '</li>';
    }).join('') + '</ul>';
    // Tendance des semaines précédentes, répartition seulement.
    var n = Math.max(2, Math.min(12, num(C.semainesCharge) || 6)), sems = [];
    for (var i = n - 1; i >= 0; i--) sems.push(sem - i * 7 * 86400);
    h += '<details class="fr-mt-2w"><summary>Les ' + n + ' dernières semaines</summary><div class="mg-meteo-defil"><table class="mg-meteo"><caption class="fr-sr-only">Répartition des réponses par semaine</caption><thead><tr><th scope="col">Niveau</th>' +
      sems.map(function (x) { return '<th scope="col">' + esc(dateTexte(x, { day: 'numeric', month: 'short' })) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      NIVEAUX_CHARGE.map(function (nv) { return '<tr><th scope="row">' + esc(nv.nom) + '</th>' + sems.map(function (x) { return '<td>' + chargeSemaine(x).filter(function (c) { return c.Niveau === nv.nom; }).length + '</td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table></div></details>';
    h += '<details class="mg-saisie fr-mt-2w"><summary>Donner ma charge de la semaine</summary><form data-form="charge" class="fr-mt-2w">' +
      '<fieldset class="fr-fieldset"><legend class="fr-fieldset__legend">Comment vivez-vous votre charge cette semaine ?</legend>' +
      NIVEAUX_CHARGE.map(function (nv, k) { return '<div class="fr-fieldset__element fr-fieldset__element--inline"><div class="fr-radio-group fr-radio-group--sm"><input type="radio" id="ch-' + k + '" name="ch-niveau" value="' + esc(nv.nom) + '"' + (b.Niveau === nv.nom ? ' checked' : '') + '><label class="fr-label" for="ch-' + k + '">' + esc(nv.nom) + '</label></div></div>'; }).join('') +
      '</fieldset><div class="fr-input-group"><label class="fr-label" for="ch-raison">Ce qui pèse le plus (facultatif)<span class="fr-hint-text">Visible par l\'équipe, sans votre nom sauf si vous le choisissez. Évitez toute information personnelle ou de santé.</span></label><input class="fr-input" id="ch-raison" maxlength="140" value="' + esc(b.Raison || '') + '"></div>' +
      '<div class="fr-checkbox-group fr-checkbox-group--sm"><input type="checkbox" id="ch-nom"' + (b.Nominatif ? ' checked' : '') + '><label class="fr-label" for="ch-nom">Montrer mon nom avec ma réponse</label></div>' +
      '<p class="fr-text--xs fr-mt-1w">Une réponse par personne et par semaine : la dernière compte. Dans une petite équipe, une réponse peut être reconnue même sans nom. Les propriétaires du document peuvent voir qui a répondu.</p>' +
      '<button type="submit" class="fr-btn">Envoyer</button></form></details>';
    return h;
  }

  // Tension de charge de l'équipe, qualifiée par le manager pour le niveau Pilotage (jamais les réponses individuelles).
  function zoneTension() {
    var sem = lundi(aujourdhui()), t = tensionDe(vue.equipe, sem), nv = t && niveau(NIVEAUX_TENSION, t.Tension);
    var h = t ? '<p class="mg-tension"><span class="mg-pastille mg-statut--' + nv.code + '" aria-hidden="true">' + nv.symbole + '</span> <strong>Tension ' + esc(String(t.Tension).toLowerCase()) + '</strong> cette semaine' + (t.Commentaire ? ' : ' + esc(t.Commentaire) : '') + '</p>' +
      '<p class="mg-action__meta">' + (t.Qualifie_par ? 'Qualifiée par ' + esc(t.Qualifie_par) : '') + '</p>' :
      '<p class="mg-vide">Tension de la semaine pas encore qualifiée.</p>';
    h += '<p class="fr-text--sm">C\'est ce que reçoit le niveau Pilotage : une appréciation de l\'équipe, jamais les réponses des agents.</p>' +
      '<details class="mg-saisie fr-mt-2w"><summary>Qualifier la tension de la semaine</summary><form data-form="tension" class="fr-mt-2w"><fieldset class="fr-fieldset"><legend class="fr-fieldset__legend">Tension de charge de l\'équipe' + (vue.equipe ? ' ' + esc(vue.equipe) : '') + '</legend>' +
      NIVEAUX_TENSION.map(function (n, k) { return '<div class="fr-fieldset__element fr-fieldset__element--inline"><div class="fr-radio-group fr-radio-group--sm"><input type="radio" id="te-' + k + '" name="te-niveau" value="' + esc(n.nom) + '"' + (t && t.Tension === n.nom ? ' checked' : '') + '><label class="fr-label" for="te-' + k + '">' + esc(n.nom) + '</label></div></div>'; }).join('') +
      '</fieldset><div class="fr-input-group"><label class="fr-label" for="te-com">Commentaire pour le pilotage (facultatif)</label><input class="fr-input" id="te-com" maxlength="200" value="' + esc(t ? t.Commentaire || '' : '') + '"></div>' +
      '<button type="submit" class="fr-btn">Enregistrer</button></form></details>';
    return h;
  }

  // Niveau Pilotage : tension qualifiée par équipe, sur plusieurs semaines.
  function zoneTensions() {
    var eqs = equipesConnues(), sem = lundi(aujourdhui()), sems = [];
    if (!eqs.length) return '<p class="mg-vide">Aucune équipe : renseignez la liste des équipes dans les réglages.</p>';
    for (var i = 5; i >= 0; i--) sems.push(sem - i * 7 * 86400);
    var h = '<div class="mg-meteo-defil"><table class="mg-meteo"><caption class="fr-sr-only">Tension de charge par équipe et par semaine</caption><thead><tr><th scope="col">Équipe</th>' +
      sems.map(function (x) { return '<th scope="col"' + (x === sem ? ' class="mg-meteo__auj"' : '') + '>' + esc(dateTexte(x, { day: 'numeric', month: 'short' })) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      eqs.map(function (e) {
        return '<tr><th scope="row">' + esc(e) + '</th>' + sems.map(function (x) {
          var t = tensionDe(e, x), n = t && niveau(NIVEAUX_TENSION, t.Tension), info = n ? n.nom + (t.Commentaire ? ' : ' + t.Commentaire : '') : 'Non qualifiée';
          return '<td class="mg-meteo__case' + (n ? ' mg-statut--' + n.code : '') + (x === sem ? ' mg-meteo__auj' : '') + '" title="' + esc(info) + '"><span aria-hidden="true">' + (n ? n.symbole : '·') + '</span><span class="fr-sr-only">' + esc(e + ', semaine du ' + dateTexte(x)) + ' : ' + esc(info) + '</span></td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';
    var com = eqs.map(function (e) { return tensionDe(e, sem); }).filter(function (t) { return t && t.Tension !== 'Normale' && t.Commentaire; });
    if (com.length) h += '<ul class="mg-commentaires">' + com.map(function (t) { var n = niveau(NIVEAUX_TENSION, t.Tension); return '<li>' + badge(t.Tension, n && n.code === 'rouge' ? 'error' : 'warning') + ' <strong>' + esc(t.Equipe) + '</strong> : ' + esc(t.Commentaire) + '</li>'; }).join('') + '</ul>';
    return h;
  }

  function zoneActions(z) {
    var auj = aujourdhui(), semaine = auj + 7 * 86400;
    var acts = toutesActions().filter(function (a) { return !z.source || z.source === a.source; });
    var decision = !aTable('Actions_reunion') && !DEMO ? '' : '<details class="mg-saisie fr-mt-2w"><summary>Noter une décision du point d\'équipe</summary><form data-form="decision" class="fr-mt-2w">' +
      '<div class="fr-input-group"><label class="fr-label" for="dc-int">Action décidée</label><input class="fr-input" id="dc-int" required></div>' +
      '<div class="mg-deux"><div class="fr-input-group"><label class="fr-label" for="dc-resp">Responsable</label><input class="fr-input" id="dc-resp"></div>' +
      '<div class="fr-input-group"><label class="fr-label" for="dc-ech">Échéance (facultatif)</label><input class="fr-input" type="date" id="dc-ech"></div></div>' +
      '<p class="fr-text--xs">Enregistrée avec les actions de réunion (table <code>Actions_reunion</code>), suivie au même endroit.</p>' +
      '<button type="submit" class="fr-btn">Noter l\'action</button></form></details>';
    if (!acts.length) return '<p class="mg-vide">Aucune action ouverte.</p>' + decision;
    var groupes = [['En retard', 'rouge', acts.filter(function (a) { return a.echeance && a.echeance < auj; })],
      ['Dans les 7 jours', 'orange', acts.filter(function (a) { return a.echeance && a.echeance >= auj && a.echeance <= semaine; })],
      ['Plus tard ou sans échéance', '', acts.filter(function (a) { return !a.echeance || a.echeance > semaine; })]];
    return '<div class="mg-actions">' + groupes.map(function (g) {
      return '<section class="mg-actions__col' + (g[1] ? ' mg-statut-bord--' + g[1] : '') + '"><h3 class="fr-h6">' + g[0] + ' <span class="mg-compte">(' + g[2].length + ')</span></h3>' +
        (g[2].length ? '<ul class="mg-actions__liste">' + g[2].slice(0, 8).map(function (a) {
          return '<li><p class="mg-action__titre">' + esc(a.intitule) + '</p><p class="mg-action__meta">' + (a.responsable ? esc(a.responsable) + ' · ' : '') + (a.echeance ? esc(dateTexte(a.echeance)) : 'sans échéance') + ' · ' + badge(a.source) + ' ' + esc(a.origine) + '</p>' +
            (a.etats.length ? '<div class="mg-saisie"><label class="fr-sr-only" for="ac-' + a.table + a.id + '">État</label><select class="fr-select fr-select--sm mg-select-etat" id="ac-' + a.table + a.id + '" data-action-table="' + a.table + '" data-action-id="' + a.id + '">' +
              a.etats.map(function (e) { return '<option' + (e === a.etat ? ' selected' : '') + '>' + esc(e) + '</option>'; }).join('') + '</select></div>' : '') + '</li>';
        }).join('') + '</ul>' + (g[2].length > 8 ? '<p class="fr-text--sm">Et ' + (g[2].length - 8) + ' autre(s).</p>' : '') : '<p class="mg-vide">Aucune.</p>') + '</section>';
    }).join('') + '</div>' + decision;
  }

  function zoneReunion(z) {
    var r = prochaineReunion(z.instance);
    if (!r) return '<p class="mg-vide">Aucune réunion à venir' + (z.instance ? ' pour « ' + esc(z.instance) + ' »' : '') + '.</p>';
    var pts = (data.Points || []).filter(function (p) { return num(p.Reunion) === r.id && p.Statut === 'Retenu'; }).sort(function (a, b) { return (a.Ordre || 0) - (b.Ordre || 0); });
    var prop = (data.Points || []).filter(function (p) { return num(p.Reunion) === r.id && (p.Statut || 'Proposé') === 'Proposé'; }).length;
    var m = String(r.Heure || '').match(/^(\d{1,2})[:h](\d{2})/), t = m ? (+m[1]) * 60 + (+m[2]) : null;
    return '<p class="mg-reunion__titre">' + esc(r.Titre) + '</p><p class="mg-reunion__quand">' + esc(dateTexte(r.Date, { weekday: 'long', day: 'numeric', month: 'long' })) + (r.Heure ? ' à ' + esc(r.Heure) : '') + (r.Lieu ? ' · ' + esc(r.Lieu) : '') + '</p>' +
      (pts.length ? '<ol class="mg-odj">' + pts.map(function (p) {
        var hr = t === null ? '' : String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
        if (t !== null) t += num(p.Duree);
        return '<li><span class="mg-odj__heure">' + hr + '</span> ' + esc(p.Titre) + (p.Porteur ? ' <span class="mg-gris">(' + esc(p.Porteur) + ')</span>' : '') + '</li>';
      }).join('') + '</ol>' : '<p class="mg-vide">Ordre du jour encore vide.</p>') +
      (prop ? '<p class="fr-text--sm">' + prop + ' proposition' + (prop > 1 ? 's' : '') + ' de point en attente.</p>' : '');
  }

  function zoneProjets() {
    var phases = choixDe('Projets', 'Phase');
    var projets = (data.Projets || []).filter(function (p) { return !p.Archive && p.Etat !== 'Terminé' && p.Etat !== 'Abandonné'; });
    if (!phases.length) phases = projets.map(function (p) { return p.Phase; }).filter(function (x, i, a) { return x && a.indexOf(x) === i; });
    phases = phases.filter(function (ph) { return ph !== 'Clos'; });
    if (!projets.length) return '<p class="mg-vide">Aucun projet en cours.</p>';
    return '<div class="mg-kanban" style="--mg-colonnes:' + Math.max(1, phases.length) + '">' + phases.map(function (ph) {
      var l = projets.filter(function (p) { return p.Phase === ph; });
      return '<section class="mg-kanban__col"><h3 class="mg-kanban__titre">' + esc(ph) + ' <span class="mg-compte">' + l.length + '</span></h3><ul>' +
        l.slice(0, 6).map(function (p) {
          var alerte = p.Etat === 'Bloqué' ? 'error' : p.Etat === 'En pause' ? 'warning' : '';
          return '<li class="mg-kanban__carte' + (alerte ? ' mg-kanban__carte--' + alerte : '') + '">' + esc(p.Titre) + (alerte ? ' ' + badge(p.Etat, alerte) : '') + '</li>';
        }).join('') + (l.length > 6 ? '<li class="mg-gris">+ ' + (l.length - 6) + '</li>' : '') + '</ul></section>';
    }).join('') + '</div>';
  }

  function zoneTexte(z) {
    return '<div class="mg-texte">' + esc(z.contenu || 'Message à rédiger dans les réglages.').split(/\n{2,}/).map(function (p) { return '<p>' + p.replace(/\n/g, '<br>') + '</p>'; }).join('') + '</div>';
  }

  // Tableau de bord grist-graphique : monté après le rendu, avec ses propres modules.
  function monterTableaux() {
    app.querySelectorAll('[data-tableau]').forEach(function (zone) {
      var cle = zone.getAttribute('data-tableau');
      var t = etat.tableaux.filter(function (x) { return x.cle === cle; })[0];
      if (!t) { zone.innerHTML = '<p class="mg-vide">Tableau de bord introuvable. Choisissez-en un dans les réglages.</p>'; return; }
      if (!window.Tableau || !window.Donnees) { zone.innerHTML = '<p class="mg-vide">Les modules de grist-graphique n\'ont pas pu être chargés.</p>'; return; }
      var source = DEMO ? window.Donnees.sourceDemo('../../grist-graphique/v1/exemples/demo.json') : window.Donnees.sourceWidget();
      var conf = DEMO ? source.config().then(function (c) { return c.config; }) : Promise.resolve().then(function () {
        var col = colonnesDe(t.hote).filter(function (c) { return c.colId === 'Config_graphique'; })[0];
        return JSON.parse(col.description);
      });
      conf.then(function (c) {
        var tb = c.tableaux[t.index];
        return source.charger(window.Tableau.tablesUtilisees(tb)).then(function (donnees) {
          window.Tableau.monter(zone, { tableau: tb, donnees: donnees, interactif: !etat.affichage, titreNiveau: 3 });
        });
      }).catch(function (e) { zone.innerHTML = '<p class="mg-vide">Tableau de bord illisible : ' + esc(e.message || e) + '</p>'; });
    });
  }

  function rendreZone(z) {
    if (PUBLIC && ZONES_PRIVEES.indexOf(z.type) >= 0) return '';
    var s = sources(), titre = z.titre || (TYPES_ZONE.filter(function (t) { return t[0] === z.type; })[0] || [0, ''])[1], corps;
    if (z.type === 'synthese') corps = zoneSynthese();
    else if (z.type === 'meteo') corps = s.meteo ? zoneMeteo() : manque('la table Meteo');
    else if (z.type === 'signalements') corps = s.signalements ? zoneSignalements(z, false) : manque('la table Signalements');
    else if (z.type === 'escalades') corps = s.signalements ? zoneSignalements(z, true) : manque('la table Signalements');
    else if (z.type === 'priorites') corps = s.priorites ? zonePriorites() : manque('la table Priorites (Réglages › Deux niveaux)');
    else if (z.type === 'charge') corps = pilotage() ? '<p class="mg-vide">La charge vécue des agents n\'est jamais montrée au niveau Pilotage : voir la tension de charge des équipes.</p>' : s.charge ? zoneCharge() : manque('la charge vécue, désactivée (Réglages › Deux niveaux)');
    else if (z.type === 'tension') corps = s.tensions ? zoneTension() : manque('la table Tensions_charge (Réglages › Deux niveaux)');
    else if (z.type === 'tensions') corps = s.tensions ? zoneTensions() : manque('la table Tensions_charge (Réglages › Deux niveaux)');
    else if (z.type === 'actions') corps = s.actionsReunion || s.actionsProjet ? zoneActions(z) : manque('les actions de grist-reunion ou de grist-projet');
    else if (z.type === 'reunion') corps = s.reunions ? zoneReunion(z) : manque('les tables de grist-reunion');
    else if (z.type === 'projets') corps = s.projets ? zoneProjets() : manque('les tables de grist-projet');
    else if (z.type === 'tableau') { corps = '<div data-tableau="' + esc(z.tableau || (etat.tableaux[0] || {}).cle || '') + '"><p>Chargement…</p></div>'; if (z.type === 'tableau' && !z.titre) titre = ''; }
    else corps = zoneTexte(z);
    return '<section class="mg-zone mg-zone--' + esc(z.type) + '" style="--mg-largeur:' + (num(z.largeur) || 12) + '">' + (titre ? '<h2 class="mg-zone__titre">' + esc(titre) + '</h2>' : '') + corps + '</section>';
  }
  function manque(quoi) { return '<p class="mg-vide">Cette zone a besoin de ' + quoi + ' dans ce document.</p>'; }

  // ---------------------------------------------------------------------------
  // Rendu
  // ---------------------------------------------------------------------------

  function blocAlerte() {
    return etat.alerte ? '<div class="fr-alert fr-alert--sm fr-alert--' + etat.alerte.type + ' mg-alerte" role="' + (etat.alerte.type === 'error' ? 'alert' : 'status') + '"><p>' + esc(etat.alerte.texte) + '</p></div>' : '';
  }

  function rendre() {
    monterCoque();
    if (!DEMO && (!aTable('Meteo') || !aTable('Signalements'))) { app.innerHTML = vueInstallation(); return; }
    var ec = ecrans();
    if (etat.ecran >= ec.length) etat.ecran = 0;
    var e = ec[etat.ecran];
    var h = '<div class="mg-barre"><nav class="mg-ecrans" aria-label="Écrans"><ul class="fr-btns-group fr-btns-group--inline-sm fr-btns-group--sm">' +
      ec.map(function (x, i) { return '<li><button type="button" class="fr-btn' + (i === etat.ecran ? '' : ' fr-btn--secondary') + '" data-ecran="' + i + '"' + (i === etat.ecran ? ' aria-current="page"' : '') + '>' + esc(x.titre || 'Écran ' + (i + 1)) + '</button></li>'; }).join('') +
      '</ul></nav><p class="mg-niveau">' + (pilotage() ? badge('Pilotage', 'purple-glycine') : badge(vue.equipe ? 'Équipe ' + vue.equipe : 'Équipe', 'blue-ecume')) + '</p><p class="mg-horloge" aria-hidden="true"></p>' +
      '<button type="button" class="fr-btn fr-btn--sm fr-btn--tertiary fr-icon-fullscreen-line fr-btn--icon-left mg-bouton-affichage" data-action="affichage">' + (etat.affichage ? 'Quitter le mode affichage' : 'Mode affichage') + '</button></div>' +
      blocAlerte() + blocColonnesManquantes() + '<div class="mg-grille">' + (e.zones || []).map(rendreZone).join('') + '</div>';
    app.innerHTML = h;
    majHorloge();
    monterTableaux();
  }

  // ---------------------------------------------------------------------------
  // Installation
  // ---------------------------------------------------------------------------

  function vueInstallation() {
    return '<h1 class="fr-h3">Installer l\'espace de management visuel</h1>' + blocAlerte() +
      '<p>Le widget va créer quatre tables dans ce document : <code>Meteo</code> (la météo du jour par rubrique, facultative), <code>Signalements</code> (les problèmes, les demandes d\'arbitrage et leur escalade), <code>Priorites</code> (priorités et points chauds) et <code>Tensions_charge</code> (la tension de charge de chaque équipe, pour le pilotage).' +
      (aTable('Meteo') || aTable('Signalements') ? ' La table déjà présente est gardée : le widget lui ajoute seulement les colonnes qui lui manquent, rien n\'est renommé ni supprimé.</p><p class="fr-text--sm">' + CONSEIL_RENOMMER + '</p>' : ' Les tables existantes ne sont pas modifiées.</p>') +
      '<p>Il affichera aussi, s\'ils sont dans ce document, les tableaux de bord de <strong>grist-graphique</strong>, les réunions et actions de <strong>grist-reunion</strong> et les projets de <strong>grist-projet</strong>.</p>' +
      '<fieldset class="fr-fieldset"><legend class="fr-fieldset__legend">Niveau de cette vue</legend>' +
      '<div class="fr-fieldset__element"><div class="fr-radio-group"><input type="radio" id="inst-eq" name="inst-niveau" value="equipe" checked><label class="fr-label" for="inst-eq">Équipe<span class="fr-hint-text">Le point régulier de l\'équipe : priorités, signalements, actions, charge.</span></label></div></div>' +
      '<div class="fr-fieldset__element"><div class="fr-radio-group"><input type="radio" id="inst-pi" name="inst-niveau" value="pilotage"><label class="fr-label" for="inst-pi">Pilotage<span class="fr-hint-text">Le point entre managers : ce que les équipes escaladent, sans données individuelles.</span></label></div></div></fieldset>' +
      '<p class="fr-text--sm">Les deux niveaux partagent les mêmes tables : ajoutez une seconde vue Personnalisée avec la même adresse pour l\'autre niveau (Réglages › Deux niveaux). À faire par un propriétaire du document. Le widget doit avoir l\'accès complet au document.</p>' +
      '<ul class="fr-btns-group fr-btns-group--inline-md"><li><button type="button" class="fr-btn" data-installer="vide">Créer les tables</button></li>' +
      '<li><button type="button" class="fr-btn fr-btn--secondary" data-installer="exemple">Créer les tables avec un exemple fictif</button></li></ul>';
  }

  function choix(l) { return { type: 'Choice', widgetOptions: JSON.stringify({ choices: l }) }; }
  // AddColumn crée par défaut une colonne de formule vide : les colonnes de saisie sont déclarées comme données.
  function donnee(def) { return Object.assign({ isFormula: false }, def); }
  function schemaMg() {
    return {
      Meteo: [['Date', { type: 'Date' }], ['Rubrique', choix(C.rubriques)], ['Statut', { type: 'Choice', widgetOptions: JSON.stringify({ choices: STATUTS_METEO.map(function (s) { return s.nom; }), choiceOptions: COULEURS_GRIST }) }],
        ['Commentaire', { type: 'Text' }], ['Saisi_par', { type: 'Text', isFormula: false, formula: 'user.Name' }], [NOM_COLONNE_CONFIG, { type: 'Text' }]],
      Signalements: [['Titre', { type: 'Text' }], ['Description', { type: 'Text' }], ['Rubrique', choix(C.rubriques)], ['Gravite', { type: 'Choice', widgetOptions: JSON.stringify({ choices: GRAVITES, choiceOptions: COULEURS_GRIST }) }],
        ['Statut', choix(STATUTS_SIGNALEMENT)], ['Escalade', choix(C.escalade)], ['Responsable', { type: 'Text' }], ['Resolution', { type: 'Text' }],
        ['Signale_par', { type: 'Text', isFormula: false, formula: 'user.Name' }], ['Signale_le', { type: 'DateTime:Europe/Paris', isFormula: false, formula: 'NOW()' }],
        ['Resolu_le', { type: 'DateTime:Europe/Paris' }]]
    };
  }
  // Deux niveaux : tables et colonnes ajoutées sans rien retirer (bouton des réglages, ou installation d'un nouvel espace).
  function equipesChoix() { return (C.equipes || []).slice(); }
  function schemaDeuxNiveaux() {
    var eq = choix(equipesChoix());
    return {
      colonnes: [['Signalements', 'Equipe', eq], ['Signalements', 'Nature', choix(NATURES)], ['Meteo', 'Equipe', eq], ['Actions_reunion', 'Equipe', eq]],
      tables: {
        Priorites: [['Titre', { type: 'Text' }], ['Detail', { type: 'Text' }], ['Type', choix(TYPES_PRIORITE)], ['Equipe', eq], ['Debut', { type: 'Date' }], ['Fin', { type: 'Date' }],
          ['Ordre', { type: 'Numeric' }], ['Publie_par', { type: 'Text', isFormula: false, formula: 'user.Name' }]],
        Tensions_charge: [['Semaine', { type: 'Date' }], ['Equipe', eq], ['Tension', { type: 'Choice', widgetOptions: JSON.stringify({ choices: NIVEAUX_TENSION.map(function (n) { return n.nom; }), choiceOptions: { 'Normale': COULEURS_GRIST['Conforme'], 'Tendue': COULEURS_GRIST['À surveiller'], 'Critique': COULEURS_GRIST['Critique'] } }) }],
          ['Commentaire', { type: 'Text' }], ['Qualifie_par', { type: 'Text', isFormula: false, formula: 'user.Name' }], ['Qualifie_le', { type: 'DateTime:Europe/Paris', isFormula: false, formula: 'NOW()' }]]
      }
    };
  }
  // Charge vécue : créée seulement quand un propriétaire l'active (avis du délégué à la protection des données d'abord).
  var FORMULE_RETENUE = "$id == max(r.id for r in Charge.lookupRecords(Saisi_par=$Saisi_par, Semaine=$Semaine, Equipe=$Equipe))";
  function schemaCharge() {
    return [['Semaine', { type: 'Date' }], ['Equipe', choix(equipesChoix())],
      ['Niveau', { type: 'Choice', widgetOptions: JSON.stringify({ choices: NIVEAUX_CHARGE.map(function (n) { return n.nom; }), choiceOptions: { 'Confortable': COULEURS_GRIST['Conforme'], 'Chargé': COULEURS_GRIST['À surveiller'], 'Débordé': COULEURS_GRIST['Critique'] } }) }],
      ['Raison', { type: 'Text' }], ['Nominatif', { type: 'Bool' }],
      ['Nom', { type: 'Text', isFormula: false, formula: 'user.Name' }], ['Saisi_par', { type: 'Text', isFormula: false, formula: 'user.Email' }],
      ['Saisi_le', { type: 'DateTime:Europe/Paris', isFormula: false, formula: 'NOW()' }]];
  }
  function actionsDeuxNiveaux(avecCharge) {
    var sch = schemaDeuxNiveaux(), a = [];
    Object.keys(sch.tables).forEach(function (t) {
      if (!aTable(t)) a.push(['AddTable', t, sch.tables[t].map(function (c) { return Object.assign({ id: c[0] }, c[1]); })]);
      else sch.tables[t].forEach(function (c) { if (!aColonne(t, c[0])) a.push(['AddColumn', t, c[0], donnee(c[1])]); });
    });
    sch.colonnes.forEach(function (c) { if (aTable(c[0]) && !aColonne(c[0], c[1])) a.push(['AddColumn', c[0], c[1], donnee(c[2])]); });
    if (avecCharge) {
      if (!aTable('Charge')) a.push(['AddTable', 'Charge', schemaCharge().map(function (c) { return Object.assign({ id: c[0] }, c[1]); })]);
      if (!aColonne('Charge', 'Retenue')) a.push(['AddColumn', 'Charge', 'Retenue', { type: 'Bool', isFormula: true, formula: FORMULE_RETENUE }]);
    }
    return a;
  }
  function deuxNiveauxPrets() { return aTable('Priorites') && aTable('Tensions_charge') && aColonne('Signalements', 'Equipe') && aColonne('Signalements', 'Nature'); }
  // Affectation des personnes aux équipes, pour les règles par équipe : colonne Equipe de la table partagée Personnes.
  function actionsPersonnes() {
    var eq = choix(equipesChoix().concat([C.nomPilotage || DEFAUTS.nomPilotage])), a = [];
    if (!aTable('Personnes')) a.push(['AddTable', 'Personnes', [{ id: 'Nom', type: 'Text' }, { id: 'Email', type: 'Text' }, Object.assign({ id: 'Equipe' }, eq)]]);
    else {
      if (!aColonne('Personnes', 'Email')) a.push(['AddColumn', 'Personnes', 'Email', donnee({ type: 'Text' })]);
      if (!aColonne('Personnes', 'Equipe')) a.push(['AddColumn', 'Personnes', 'Equipe', donnee(eq)]);
    }
    return a;
  }
  function preparerDeuxNiveaux(quoi) {
    var a = quoi === 'personnes' ? actionsPersonnes() : actionsDeuxNiveaux(quoi === 'charge');
    if (!a.length) { if (configLab) configLab.message('info', 'Rien à ajouter.'); return; }
    grist.docApi.applyUserActions(a).then(function () { return charger(); }).then(function () {
      if (configLab) { configLab.message('success', a.length + ' ajout(s) dans le document. Rien n\'a été retiré.'); configLab.rafraichir('reglages'); }
      rendre();
    }).catch(function (err) {
      if (configLab) configLab.message('error', 'Ajout impossible : seuls les propriétaires du document peuvent ajouter des tables et des colonnes. (' + ((err && err.message) || err) + ')');
      if (configLab) configLab.rafraichir('reglages');
    });
  }

  // Tables Meteo ou Signalements déjà présentes (créées à la main) : le widget les garde
  // et leur ajoute seulement les colonnes qui leur manquent.
  // La colonne des réglages n'en fait pas partie : elle est créée au premier enregistrement.
  function colonnesManquantes() {
    if (DEMO || PUBLIC || !meta.tables.length) return [];
    var sch = schemaMg(), r = [];
    Object.keys(sch).forEach(function (t) {
      if (!aTable(t)) return;
      sch[t].forEach(function (c) { if (c[0] !== NOM_COLONNE_CONFIG && !aColonne(t, c[0])) r.push({ table: t, id: c[0], def: c[1] }); });
    });
    return r;
  }
  var CONSEIL_RENOMMER = 'Si l\'une de vos colonnes contient déjà cette information sous un autre nom (par exemple <code>Jour</code> au lieu de <code>Date</code>), renommez-la d\'abord dans Grist avec le nom attendu : ses données seront reprises.';
  function blocColonnesManquantes() {
    var m = colonnesManquantes();
    if (!m.length) return '';
    return '<div class="fr-alert fr-alert--warning fr-mb-3w"><h2 class="fr-alert__title">Des colonnes attendues manquent dans vos tables</h2>' +
      '<p>' + m.map(function (c) { return '<code>' + esc(c.table + '.' + c.id) + '</code>'; }).join(', ') + '. Sans elles, le widget ne peut ni afficher ni enregistrer ces informations.</p>' +
      '<p class="fr-text--sm">' + CONSEIL_RENOMMER + ' Sinon, ajoutez-les : rien n\'est renommé ni supprimé. À faire par un propriétaire du document.</p>' +
      '<button type="button" class="fr-btn fr-btn--sm" data-action="completer-colonnes">Ajouter les colonnes manquantes</button></div>';
  }
  function actionsColonnesManquantes() {
    return colonnesManquantes().map(function (c) { return ['AddColumn', c.table, c.id, donnee(c.def)]; });
  }
  function completerColonnes() {
    var a = actionsColonnesManquantes();
    if (!a.length) return;
    grist.docApi.applyUserActions(a).then(function () {
      etat.alerte = { type: 'success', texte: a.length + ' colonne(s) ajoutée(s).' };
      return charger();
    }).then(rendre).catch(function (err) {
      etat.alerte = { type: 'error', texte: 'Ajout impossible : seuls les propriétaires du document peuvent ajouter des colonnes. (' + ((err && err.message) || err) + ')' };
      rendre();
    });
  }
  function installer(exemple) {
    var sch = schemaMg();
    var actions = Object.keys(sch).filter(function (t) { return !aTable(t); }).map(function (t) {
      return ['AddTable', t, sch[t].map(function (c) { return Object.assign({ id: c[0] }, c[1]); })];
    });
    actions = actions.concat(actionsColonnesManquantes());
    var niveauVue = (document.querySelector('input[name="inst-niveau"]:checked') || {}).value || 'equipe';
    return grist.docApi.applyUserActions(actions).then(function () {
      return Promise.all([grist.docApi.fetchTable('_grist_Tables'), grist.docApi.fetchTable('_grist_Tables_column')]).then(function (m) {
        meta.tables = enLignes(m[0]).filter(function (t) { return !/^_grist/.test(t.tableId); }); meta.colonnes = enLignes(m[1]);
        // Nouvel espace : les tables des deux niveaux sont créées tout de suite ; la météo est facultative et masquée.
        // Exemple fictif : deux équipes fictives et la météo visible, pour montrer l'outil complet.
        var cfg = exemple ? { equipes: ['Accueil', 'Gestion'] } : { meteo: false };
        if (exemple) C.equipes = cfg.equipes;
        var a = actionsDeuxNiveaux(false);
        var colCfg = colonnesDe('Meteo').filter(function (x) { return x.colId === NOM_COLONNE_CONFIG; })[0];
        if (!colCfg) a.push(['AddColumn', 'Meteo', NOM_COLONNE_CONFIG, donnee({ type: 'Text', description: JSON.stringify(cfg) })]);
        else if (!colCfg.description) a.push(['ModifyColumn', 'Meteo', NOM_COLONNE_CONFIG, { description: JSON.stringify(cfg) }]);
        return grist.docApi.applyUserActions(a);
      }).then(function () { return choisirVue(niveauVue, ''); });
    }).then(function () {
      if (!exemple) return null;
      return fetch('exemples/demo.json').then(function (r) { return r.json(); }).then(function (j) {
        var auj = aujourdhui(), ex = [];
        var sch2 = schemaDeuxNiveaux().tables;
        ['Meteo', 'Signalements', 'Priorites', 'Tensions_charge'].forEach(function (t) {
          var lignes = j.tables[t] || [], cols = {};
          (sch[t] || sch2[t]).forEach(function (c) { if (c[0] !== NOM_COLONNE_CONFIG) cols[c[0]] = []; });
          if (t === 'Signalements') { cols.Equipe = []; cols.Nature = []; }
          lignes.forEach(function (l) {
            Object.keys(cols).forEach(function (k) {
              var v = l[k];
              // Sans valeur, Grist inscrirait le nom de la personne qui installe : on garde l'exemple anonyme.
              if ((k === 'Saisi_par' || k === 'Signale_par' || k === 'Publie_par' || k === 'Qualifie_par') && !v) v = 'Exemple fictif';
              if (typeof v === 'string' && /^J[+-]\d+$/.test(v)) v = auj + 86400 * (+v.slice(1));
              else if (typeof v === 'string' && /^S-\d+$/.test(v)) v = lundi(auj) - 7 * 86400 * (+v.slice(2));
              if (k === 'Qualifie_le' && !v) v = Date.now() / 1000;
              cols[k].push(v === undefined ? null : v);
            });
          });
          ex.push(['BulkAddRecord', t, lignes.map(function () { return null; }), cols]);
        });
        return grist.docApi.applyUserActions(ex);
      });
    }).then(function () {
      etat.alerte = { type: 'success', texte: 'Espace installé.' + (exemple ? ' L\'exemple fictif est chargé : supprimez ses lignes quand vous voulez.' : '') };
      return charger();
    }).then(function () {
      // Réglages préparés avant l'installation (document vide) : on les reprend avec les tables créées.
      brouillon = null; ouvrirBrouillon(); rendre();
      if (configLab) { configLab.rafraichir('reglages'); configLab.rafraichir('donnees'); }
    }).catch(function (err) {
      etat.alerte = { type: 'error', texte: 'Installation impossible : seuls les propriétaires du document peuvent créer des tables. (' + ((err && err.message) || err) + ')' };
      rendre();
    });
  }

  // ---------------------------------------------------------------------------
  // Réglages
  // ---------------------------------------------------------------------------

  var brouillon = null;
  var ecoute = document.getElementById('mg-coque') || app;
  // Réglages › Données (commun/donnees.js) : tables partagées et colonnes de lien vers Personnes.
  // Rien n'est modifié sans un clic d'un propriétaire. Les règles d'accès de la météo et des signalements viendront
  // avec le management à deux niveaux (visibilité du ressenti de charge).
  var PARTAGE = [['Actions_reunion', 'réunion (outil de référence)', 'suivi des actions décidées en réunion ; change leur état'],
    ['Actions', 'suivi de projets (outil de référence)', 'suivi des actions des projets ; change leur état'],
    ['Reunions, Points', 'réunion (outil de référence)', 'prochaines réunions et points, en lecture seule'],
    ['Projets, Personnes', 'suivi de projets, annuaire', 'en lecture seule']];
  var LIENS = window.DonneesLab ? [DonneesLab.lienPersonne('Signalements', 'Responsable', 'relie la personne responsable du signalement à sa fiche'),
    DonneesLab.lienPersonne('Signalements', 'Signale_par', 'relie la personne qui a signalé à sa fiche'),
    DonneesLab.lienPersonne('Meteo', 'Saisi_par', 'relie la personne qui a saisi la météo à sa fiche')] : [];
  PARTAGE.push(['Personnes', 'annuaire, suivi de projets', 'colonne Equipe ajoutée par l\'outil : affectation des personnes aux équipes, lue par les règles d\'accès']);
  var aclDonnees = null;
  function texteFormule(v) { return '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'; }
  // Règles d'accès proposées. Charge vécue : l'auteur d'une réponse n'est lisible que par lui-même (et par les propriétaires),
  // sauf s'il a choisi de donner son nom. Par équipe (si Personnes a Email et Equipe) : chaque personne ne lit que son équipe ;
  // l'équipe des managers lit tout, sauf la charge vécue, et ne lit des signalements que ceux escaladés et les demandes d'arbitrage.
  function reglesAcces() {
    var r = [
      { table: 'Charge', cols: 'Saisi_par,Nom', formule: 'user.Access != OWNER and rec.Saisi_par != user.Email and not rec.Nominatif', droits: '-R',
        memo: 'L\'auteur d\'une réponse sur la charge n\'est pas visible', effet: 'l\'auteur d\'une réponse n\'est visible que par lui-même, sauf s\'il a choisi de montrer son nom (les propriétaires voient tout)' },
      { table: 'Charge', cols: '*', formule: 'user.Access != OWNER and newRec.Saisi_par != user.Email', droits: '-CU',
        memo: 'On ne répond sur la charge qu\'à son nom', effet: 'chacun ne répond qu\'à son nom' },
      { table: 'Charge', cols: '*', formule: 'user.Access != OWNER and rec.Saisi_par != user.Email', droits: '-UD',
        memo: 'On ne modifie pas la réponse d\'une autre personne', effet: 'on ne modifie ni ne retire la réponse d\'une autre personne' }];
    if (!aColonne('Personnes', 'Email') || !aColonne('Personnes', 'Equipe') || !deuxNiveauxPrets()) return r;
    var P = texteFormule(C.nomPilotage || DEFAUTS.nomPilotage), E0 = texteFormule(C.escalade[0]), ARB = texteFormule(NATURES[1]);
    var autreEquipe = 'user.Access != OWNER and user.Membre.Equipe != ' + P + ' and rec.Equipe and rec.Equipe != user.Membre.Equipe';
    r.unshift({ attribut: { name: 'Membre', tableId: 'Personnes', lookupColId: 'Email', charId: 'Email' }, effet: 'la fiche de la personne connectée (table Personnes, par son adresse), qui donne son équipe' });
    r.push({ table: 'Charge', cols: '*', formule: 'user.Access != OWNER and rec.Equipe != user.Membre.Equipe', droits: '-R',
      memo: 'La charge vécue d\'une équipe n\'est lue que par cette équipe', effet: 'la charge vécue n\'est lue que par l\'équipe concernée, jamais par le pilotage' });
    ['Meteo', 'Priorites', 'Tensions_charge'].forEach(function (t) {
      r.push({ table: t, cols: '*', formule: autreEquipe, droits: '-RUD', memo: 'Ligne d\'une autre équipe', effet: 'chaque personne ne lit et ne modifie que les lignes de son équipe (et les lignes sans équipe) ; l\'équipe des managers lit tout' });
    });
    r.push({ table: 'Signalements', cols: '*', formule: 'user.Access != OWNER and user.Membre.Equipe == ' + P + ' and (not rec.Escalade or rec.Escalade == ' + E0 + ') and rec.Nature != ' + ARB, droits: '-R',
      memo: 'Le pilotage ne voit que ce que les équipes escaladent', effet: 'l\'équipe des managers ne lit que les signalements escaladés et les demandes d\'arbitrage' });
    r.push({ table: 'Signalements', cols: '*', formule: autreEquipe, droits: '-RUD', memo: 'Signalement d\'une autre équipe', effet: 'chaque personne ne lit et ne modifie que les signalements de son équipe' });
    return r;
  }
  function optionsDonnees() { return { demo: DEMO, tables: ['Meteo', 'Signalements', 'Priorites', 'Tensions_charge', 'Charge'], partage: PARTAGE, regles: reglesAcces(), liens: LIENS,
    noteRegles: 'Les règles par équipe s\'appuient sur la table <code>Personnes</code> (colonnes <code>Email</code> et <code>Equipe</code>) : renseignez l\'équipe de chaque personne avant de les installer (Réglages › Général, Deux niveaux). Une personne sans fiche ne lit que les lignes sans équipe. Les propriétaires du document gardent tous les droits : réservez ce rôle aux personnes qui administrent le document. Après installation, vérifiez avec <strong>Voir en tant que</strong>.' }; }
  function rendreDonnees(zone) {
    if (!window.DonneesLab) { zone.innerHTML = ''; return; }
    if (!DEMO && !aclDonnees) DonneesLab.lire().then(function (a) { aclDonnees = a; if (configLab) configLab.rafraichir('donnees'); });
    zone.innerHTML = DonneesLab.html(aclDonnees, meta, optionsDonnees());
    if (zone.getAttribute('data-branche')) return;
    zone.setAttribute('data-branche', '1');
    zone.addEventListener('click', function (e) {
      var b = e.target.closest('[data-donnees]');
      if (!b || b.disabled) return;
      b.disabled = true;
      if (b.getAttribute('data-donnees') === 'regles') {
        DonneesLab.installerRegles(aclDonnees, meta, reglesAcces()).then(function (n) {
          aclDonnees = null;
          if (configLab) { configLab.message('success', n + ' règle(s) d\'accès installée(s). Grist recharge le document.'); configLab.rafraichir('donnees'); }
        }).catch(function (err) {
          b.disabled = false;
          if (configLab) configLab.message('error', 'Installation refusée par Grist : seuls les propriétaires du document le peuvent. (' + ((err && err.message) || err) + ')');
        });
        return;
      }
      DonneesLab.ajouterLiens(meta, LIENS).then(function (n) {
        if (configLab) configLab.message('success', n + ' colonne(s) de lien ajoutée(s).');
        return charger();
      }).then(function () { rendre(); if (configLab) configLab.rafraichir('donnees'); }).catch(function (err) {
        b.disabled = false;
        if (configLab) configLab.message('error', 'Modification refusée par Grist : seuls les propriétaires du document le peuvent. (' + ((err && err.message) || err) + ')');
      });
    });
  }

  var configLab = null, avantApercu = null;
  function ouvrirBrouillon() {
    if (!brouillon) {
      brouillon = JSON.parse(JSON.stringify(reglages || {}));
      var e = brouillon[cleEcrans()];
      brouillon.ecrans = JSON.parse(JSON.stringify(Array.isArray(e) && e.length ? e : ecransAuto()));
      delete brouillon.ecransPilotage;
    }
  }
  function reglagesPropres() {
    var b = brouillon;
    var h = '<div class="cl-panneau">' +
      '<p class="fr-text--sm">Réservé aux propriétaires du document. Enregistré dans la description de la colonne <code>' + NOM_COLONNE_CONFIG + '</code> de la table Meteo.</p>' +
      '<section><h2 class="fr-h5">Écrans du niveau ' + (pilotage() ? 'Pilotage' : 'Équipe') + '</h2><p class="fr-text--sm">Chaque écran assemble des zones. En mode affichage, les écrans défilent tour à tour. Les écrans du niveau ' + (pilotage() ? 'Équipe' : 'Pilotage') + ' se règlent depuis une vue de ce niveau.</p>';
    b.ecrans.forEach(function (e, i) {
      h += '<div class="mg-reglage-ecran"><div class="mg-deux"><div class="fr-input-group"><label class="fr-label" for="re-' + i + '">Titre de l\'écran ' + (i + 1) + '</label><input class="fr-input" id="re-' + i + '" data-r="ecrans.' + i + '.titre" value="' + esc(e.titre || '') + '"></div>' +
        '<div class="mg-reglage-outils"><button type="button" class="fr-btn fr-btn--sm fr-btn--tertiary" data-r-action="monter" data-r-liste="ecrans" data-r-index="' + i + '"' + (i ? '' : ' disabled') + '>Monter</button>' +
        '<button type="button" class="fr-btn fr-btn--sm fr-btn--tertiary" data-r-action="supprimer" data-r-liste="ecrans" data-r-index="' + i + '">Supprimer l\'écran</button></div></div><ol class="mg-reglage-zones">';
      (e.zones || []).forEach(function (z, k) {
        var p = 'ecrans.' + i + '.zones.' + k;
        h += '<li class="mg-reglage-zone"><div class="mg-trois">' +
          selectR(p + '.type', 'Type de zone', z.type, TYPES_ZONE) + selectR(p + '.largeur', 'Largeur', num(z.largeur) || 12, LARGEURS) +
          '<div class="fr-input-group"><label class="fr-label" for="' + p + '.titre">Titre (facultatif)</label><input class="fr-input" id="' + p + '.titre" data-r="' + p + '.titre" value="' + esc(z.titre || '') + '"></div></div>' + optionsZone(p, z) +
          '<div class="mg-reglage-outils"><button type="button" class="fr-btn fr-btn--sm fr-btn--tertiary" data-r-action="monter" data-r-liste="ecrans.' + i + '.zones" data-r-index="' + k + '"' + (k ? '' : ' disabled') + '>Monter</button>' +
          '<button type="button" class="fr-btn fr-btn--sm fr-btn--tertiary" data-r-action="supprimer" data-r-liste="ecrans.' + i + '.zones" data-r-index="' + k + '">Supprimer la zone</button></div></li>';
      });
      h += '</ol><button type="button" class="fr-btn fr-btn--sm fr-btn--secondary" data-r-action="ajouter-zone" data-r-index="' + i + '">Ajouter une zone</button></div>';
    });
    h += '<ul class="fr-btns-group fr-btns-group--inline-sm fr-btns-group--sm fr-mt-2w"><li><button type="button" class="fr-btn fr-btn--secondary" data-r-action="ajouter-ecran">Ajouter un écran</button></li>' +
      '<li><button type="button" class="fr-btn fr-btn--tertiary" data-r-action="auto">Revenir à la composition automatique</button></li></ul></section>' +
      '<section><h2 class="fr-h5">Météo et signalements</h2>' +
      '<div class="fr-input-group"><label class="fr-label" for="rg-rub">Rubriques<span class="fr-hint-text">Une par ligne. Par défaut : santé et sécurité, qualité de service, délais, moyens, équipe.</span></label><textarea class="fr-input" rows="5" id="rg-rub">' + esc((b.rubriques || DEFAUTS.rubriques).join('\n')) + '</textarea></div>' +
      '<div class="fr-input-group"><label class="fr-label" for="rg-esc">Niveaux d\'escalade<span class="fr-hint-text">Un par ligne, du plus proche au plus élevé.</span></label><textarea class="fr-input" rows="3" id="rg-esc">' + esc((b.escalade || DEFAUTS.escalade).join('\n')) + '</textarea></div>' +
      '<div class="mg-trois">' + nombreR('joursMeteo', 'Jours affichés dans la météo', b.joursMeteo || DEFAUTS.joursMeteo) + nombreR('delaiSignalement', 'Délai de résolution d\'un signalement (jours)', b.delaiSignalement || DEFAUTS.delaiSignalement) +
      nombreR('rotation', 'Rotation des écrans en mode affichage (secondes)', b.rotation || DEFAUTS.rotation) + '</div>' +
      '<div class="fr-checkbox-group fr-checkbox-group--sm"><input type="checkbox" id="rg-we" data-r="weekend" data-r-type="case"' + (b.weekend ? ' checked' : '') + '><label class="fr-label" for="rg-we">Afficher le samedi et le dimanche dans la météo</label></div>' +
      '<div class="fr-checkbox-group fr-checkbox-group--sm"><input type="checkbox" id="rg-meteo" data-r="meteo" data-r-type="case"' + (b.meteo !== false ? ' checked' : '') + '><label class="fr-label" for="rg-meteo">Afficher la météo du jour<span class="fr-hint-text">Facultative : masquée pour un nouvel espace. Les données de la table Meteo sont gardées.</span></label></div></section>';
    return h + reglagesDeuxNiveaux(b) + '</div>';
  }
  function ouvrirBrouillonVue() { ouvrirBrouillon(); }
  function reglagesDeuxNiveaux(b) {
    var eqs = (b.equipes || []).length ? b.equipes : C.equipes || [];
    var h = '<section><h2 class="fr-h5">Deux niveaux : équipe et pilotage</h2>' +
      '<p class="fr-text--sm">Un même document pour toutes les équipes d\'une direction. Chaque équipe a sa vue (niveau Équipe) ; les managers ont une vue Pilotage, qui ne reçoit que ce que les équipes escaladent : signalements, demandes d\'arbitrage, tension de charge qualifiée par le manager. Jamais les réponses individuelles des agents.</p>';
    if (!DEMO && !deuxNiveauxPrets()) {
      h += '<div class="fr-alert fr-alert--info fr-alert--sm fr-mb-2w"><p>Ce document n\'a pas encore les tables des deux niveaux : <code>Priorites</code>, <code>Tensions_charge</code>, et les colonnes <code>Equipe</code> et <code>Nature</code> des signalements (et <code>Equipe</code> de la météo et des actions de réunion). Rien n\'est retiré.</p>' +
        '<button type="button" class="fr-btn fr-btn--sm fr-mt-1w" data-deux-niveaux="tables">Ajouter les tables et colonnes des deux niveaux</button></div>';
    }
    h += '<div class="fr-input-group"><label class="fr-label" for="rg-eq">Équipes<span class="fr-hint-text">Une par ligne. Elles deviennent les choix de la colonne Equipe.</span></label><textarea class="fr-input" rows="4" id="rg-eq">' + esc(eqs.join('\n')) + '</textarea></div>' +
      '<h3 class="fr-h6">Cette vue Grist</h3><p class="fr-text--sm">Le niveau et l\'équipe sont propres à chaque vue Personnalisée (comme l\'affichage éditeur ou page d\'usage) : une vue par équipe, une vue Pilotage.</p>' +
      '<fieldset class="fr-fieldset"><legend class="fr-fieldset__legend fr-sr-only">Niveau de cette vue</legend>' +
      [['equipe', 'Équipe'], ['pilotage', 'Pilotage']].map(function (n) { return '<div class="fr-fieldset__element fr-fieldset__element--inline"><div class="fr-radio-group fr-radio-group--sm"><input type="radio" id="vue-niv-' + n[0] + '" name="vue-niveau" value="' + n[0] + '"' + (vue.niveau === n[0] ? ' checked' : '') + '><label class="fr-label" for="vue-niv-' + n[0] + '">' + n[1] + '</label></div></div>'; }).join('') +
      '</fieldset><div class="fr-select-group"><label class="fr-label" for="vue-equipe">Équipe affichée (niveau Équipe)</label><select class="fr-select" id="vue-equipe"><option value="">Toutes les équipes</option>' +
      eqs.map(function (e) { return '<option' + (vue.equipe === e ? ' selected' : '') + '>' + esc(e) + '</option>'; }).join('') + '</select></div>' +
      '<button type="button" class="fr-btn fr-btn--sm fr-btn--secondary" data-appliquer-vue="1">Appliquer à cette vue</button>' +
      '<p class="fr-text--xs fr-mt-1w">Pour garder ce choix, cliquez ensuite sur <strong>Enregistrer</strong> en haut à droite de la vue Grist. Ce choix ne protège rien : ce que chaque personne lit dépend des règles d\'accès (Réglages › Données).</p>' +
      '<h3 class="fr-h6">Charge vécue</h3>' +
      '<div class="fr-alert fr-alert--warning fr-alert--sm fr-mb-2w"><p>Avant de l\'activer, demandez l\'avis de votre délégué à la protection des données et présentez l\'outil à l\'équipe. Chaque agent dit si sa charge est confortable, chargée ou débordante, avec une raison facultative. L\'équipe voit la répartition, sans les noms, sauf si l\'agent choisit de montrer le sien. Les propriétaires du document peuvent voir qui a répondu. Le niveau Pilotage ne lit jamais ces réponses.</p></div>' +
      '<div class="fr-checkbox-group fr-checkbox-group--sm"><input type="checkbox" id="rg-charge" data-r="charge" data-r-type="case"' + (b.charge === true ? ' checked' : '') + '><label class="fr-label" for="rg-charge">Recueillir la charge vécue des agents<span class="fr-hint-text">La table Charge est créée à l\'enregistrement. Décocher masque la zone ; les réponses sont gardées.</span></label></div>' +
      '<div class="mg-deux">' + nombreR('semainesCharge', 'Semaines montrées dans la tendance', b.semainesCharge || DEFAUTS.semainesCharge) +
      '<div class="fr-input-group"><label class="fr-label" for="rg-pil">Nom de l\'équipe des managers<span class="fr-hint-text">Valeur de la colonne Personnes.Equipe qui donne la vue de toutes les équipes dans les règles d\'accès.</span></label><input class="fr-input" id="rg-pil" data-r="nomPilotage" value="' + esc(b.nomPilotage || DEFAUTS.nomPilotage) + '"></div></div>';
    if (!DEMO && (!aColonne('Personnes', 'Equipe') || !aColonne('Personnes', 'Email'))) {
      h += '<h3 class="fr-h6">Affectation des personnes</h3><p class="fr-text--sm">Pour que chaque agent ne voie que son équipe, les règles d\'accès s\'appuient sur la table partagée <code>Personnes</code> : adresse (<code>Email</code>) et équipe (<code>Equipe</code>) de chaque personne. Rien n\'est retiré ; la table est créée si elle manque.</p>' +
        '<button type="button" class="fr-btn fr-btn--sm fr-btn--secondary" data-deux-niveaux="personnes">Préparer l\'affectation des équipes</button>';
    }
    return h + '</section>';
  }
  function selectR(p, lib, val, opts) {
    return '<div class="fr-select-group"><label class="fr-label" for="' + p + '">' + esc(lib) + '</label><select class="fr-select" id="' + p + '" data-r="' + p + '"' + (typeof opts[0][0] === 'number' ? ' data-r-type="nombre"' : '') + ' data-r-rendre="1">' +
      opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(val) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></div>';
  }
  function nombreR(c, lib, v) { return '<div class="fr-input-group"><label class="fr-label" for="rg-' + c + '">' + esc(lib) + '</label><input class="fr-input" type="number" min="1" id="rg-' + c + '" data-r="' + c + '" data-r-type="nombre" value="' + esc(v) + '"></div>'; }
  function optionsZone(p, z) {
    if (z.type === 'tableau') {
      if (!etat.tableaux.length) return '<p class="fr-text--sm">Aucun tableau de bord grist-graphique dans ce document. Ajoutez le widget grist-graphique sur une table et créez un tableau de bord.</p>';
      return selectR(p + '.tableau', 'Tableau de bord affiché', z.tableau || etat.tableaux[0].cle, etat.tableaux.map(function (t) { return [t.cle, t.titre + ' (table ' + t.hote + ')']; }));
    }
    if (z.type === 'actions') return selectR(p + '.source', 'Actions affichées', z.source || '', [['', 'Toutes'], ['Réunion', 'Réunions (grist-reunion)'], ['Projet', 'Projets (grist-projet)']]);
    if (z.type === 'reunion') {
      var inst = choixDe('Reunions', 'Instance');
      return selectR(p + '.instance', 'Instance', z.instance || '', [['', 'Toutes les instances']].concat(inst.map(function (x) { return [x, x]; })));
    }
    if (z.type === 'texte') return '<div class="fr-input-group"><label class="fr-label" for="' + p + '.contenu">Message</label><textarea class="fr-input" rows="3" id="' + p + '.contenu" data-r="' + p + '.contenu">' + esc(z.contenu || '') + '</textarea></div>';
    return '';
  }
  function chemin(o, p) { return p.split('.').reduce(function (x, k) { return x == null ? x : x[k]; }, o); }
  // Clé de premier niveau (weekend, charge…) : chemin vide, on pose sur l'objet lui-même.
  function poser(o, p, v) { var k = p.split('.'), d = k.pop(); (k.length ? chemin(o, k.join('.')) : o)[d] = v; }
  function monterCoque() {
    var z = document.getElementById('mg-coque');
    if (configLab || !z || !window.ConfigLab) return;
    ouvrirBrouillon();
    brouillon.page = brouillon.page || { marque: '', titre: 'Management visuel', pied: { accessibilite: '' } };
    configLab = window.ConfigLab.monter(z, {
      nom: 'Widget management',
      vue: { libelle: 'Management visuel', element: app },
      page: brouillon.page,
      ongletInitial: location.hash === '#reglages' ? 'reglages' : 'vue',
      onglets: [{ id: 'reglages', libelle: 'Général', rendre: function (zone) { zone.innerHTML = reglagesPropres(); } },
        { id: 'donnees', libelle: 'Données', rendre: rendreDonnees }],
      // Aperçu réel : l'outil lui-même s'affiche sous l'en-tête, avec les réglages en cours (même non enregistrés).
      surApercu: function (ouvert) {
        if (ouvert && configLab && configLab.estModifie() && brouillon) {
          avantApercu = reglages;
          var d = JSON.parse(JSON.stringify(brouillon));
          function lignes(id) { var n = document.getElementById(id); return n ? n.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean) : []; }
          var rub = lignes('rg-rub'), esc2 = lignes('rg-esc'), eq2 = lignes('rg-eq');
          if (eq2.length) d.equipes = eq2;
          if (rub.length) d.rubriques = rub; else delete d.rubriques;
          if (esc2.length) d.escalade = esc2; else delete d.escalade;
          appliquerReglages(versReglages(d)); rendre();
        } else if (!ouvert && avantApercu) { appliquerReglages(avantApercu); avantApercu = null; rendre(); }
      },
      publication: { mode: 'connecte', adresseWidget: location.href.split('#')[0].split('?')[0], texte: 'Pour un affichage en salle ou sur un écran partagé, ouvrez l\'outil puis choisissez « Mode affichage ».',
        publier: {
          lienDoc: (brouillon.publication && brouillon.publication.lienDoc) || '',
          texte: 'Les écrans du management visuel (synthèse, météo, signalements, actions, réunion, projets, tableaux) s\'affichent en page complète, sans compte Grist, en lecture seule. Réservez cette page aux informations qui peuvent être vues hors de l\'équipe.',
          construire: function (l) { return window.GristPublic ? window.GristPublic.lien(location.href.split('#')[0].split('?')[0], { doc: l, table: 'Meteo' }) : null; },
          surChangement: function (l) { brouillon.publication = { lienDoc: l }; }
        } },
      surEnregistrer: enregistrerReglages
    });
  }
  function enregistrerReglages() {
    var b = brouillon;
    if (DEMO) { if (configLab) configLab.message('info', 'Mode démonstration : rien n\'est enregistré. Dans Grist, les réglages sont enregistrés dans le document.'); return; }
    function lignes(id) { return document.getElementById(id).value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean); }
    b.rubriques = lignes('rg-rub'); b.escalade = lignes('rg-esc');
    if (document.getElementById('rg-eq')) b.equipes = lignes('rg-eq');
    if (!b.rubriques.length) delete b.rubriques;
    if (!b.escalade.length) delete b.escalade;
    var actions = [];
    if (!meta.colConfig) actions.push(['AddColumn', 'Meteo', NOM_COLONNE_CONFIG, donnee({ type: 'Text' })]);
    actions.push(['ModifyColumn', 'Meteo', NOM_COLONNE_CONFIG, { description: JSON.stringify(versReglages(b)) }]);
    if (b.charge === true && !aTable('Charge')) { C.equipes = b.equipes || []; actions = actions.concat(actionsDeuxNiveaux(true)); }
    var eqs = b.equipes || [];
    [['Meteo', 'Rubrique', b.rubriques || DEFAUTS.rubriques], ['Signalements', 'Rubrique', b.rubriques || DEFAUTS.rubriques], ['Signalements', 'Escalade', b.escalade || DEFAUTS.escalade],
      ['Signalements', 'Equipe', eqs], ['Meteo', 'Equipe', eqs], ['Priorites', 'Equipe', eqs], ['Tensions_charge', 'Equipe', eqs], ['Charge', 'Equipe', eqs], ['Actions_reunion', 'Equipe', eqs],
      ['Personnes', 'Equipe', eqs.concat([b.nomPilotage || DEFAUTS.nomPilotage])]].forEach(function (x) {
      if (x[1] === 'Equipe' && !eqs.length) return;
      var col = colonnesDe(x[0]).filter(function (c) { return c.colId === x[1]; })[0];
      if (!col) return;
      var o = {}; try { o = JSON.parse(col.widgetOptions || '{}'); } catch (e) { o = {}; }
      o.choices = x[2];
      actions.push(['ModifyColumn', x[0], x[1], { widgetOptions: JSON.stringify(o) }]);
    });
    grist.docApi.applyUserActions(actions).then(function () {
      return charger();
    }).then(function () {
      if (configLab) { configLab.enregistre(); configLab.message('success', 'Réglages enregistrés.'); }
      // Les équipes et la charge changent ce que proposent les réglages (choix de l'équipe de la vue, tables à ajouter).
      brouillon = null; ouvrirBrouillon(); rendre();
      if (configLab) { configLab.rafraichir('reglages'); configLab.rafraichir('donnees'); }
    }).catch(function (err) {
      if (configLab) configLab.message('error', 'Enregistrement impossible : seuls les propriétaires du document peuvent modifier les réglages. (' + ((err && err.message) || err) + ')');
    });
  }

  // ---------------------------------------------------------------------------
  // Mode affichage
  // ---------------------------------------------------------------------------

  var minuterieRotation = null, minuterieActualisation = null;
  function basculerAffichage(actif) {
    etat.affichage = actif;
    document.body.classList.toggle('mg-affichage', actif);
    clearInterval(minuterieRotation); clearInterval(minuterieActualisation);
    if (actif) {
      try { if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {}); } catch (e) { /* plein écran refusé */ }
      minuterieRotation = setInterval(function () { etat.ecran = (etat.ecran + 1) % ecrans().length; rendre(); }, Math.max(10, num(C.rotation) || 30) * 1000);
      minuterieActualisation = setInterval(function () { charger().then(rendre).catch(function () {}); }, 60000);
    } else {
      try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* rien */ }
    }
    rendre();
  }
  function majHorloge() {
    var z = app.querySelector('.mg-horloge');
    if (z) z.textContent = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) + ' · ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  setInterval(majHorloge, 30000);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && etat.affichage) basculerAffichage(false); });
  document.addEventListener('fullscreenchange', function () { if (!document.fullscreenElement && etat.affichage) basculerAffichage(false); });

  // ---------------------------------------------------------------------------
  // Événements
  // ---------------------------------------------------------------------------

  ecoute.addEventListener('click', function (e) {
    var el = e.target.closest('button');
    if (!el) return;
    var a = el.getAttribute('data-action');
    if (el.hasAttribute('data-ecran')) { etat.ecran = num(el.getAttribute('data-ecran')); etat.alerte = null; rendre(); return; }
    if (a === 'affichage') { basculerAffichage(!etat.affichage); return; }
    if (a === 'annuler-resolution') { etat.resolution = null; rendre(); return; }
    if (a === 'enregistrer-reglages') { enregistrerReglages(); return; }
    if (a === 'annuler-reglages') { brouillon = null; location.hash = ''; return; }
    if (a === 'completer-colonnes') { el.disabled = true; completerColonnes(); return; }
    if (el.hasAttribute('data-installer')) { el.disabled = true; installer(el.getAttribute('data-installer') === 'exemple'); return; }
    if (el.hasAttribute('data-priorite')) {
      executer([['UpdateRecord', 'Priorites', num(el.getAttribute('data-priorite')), { Fin: aujourdhui() - 86400 }]], 'Retirée de l\'écran (elle reste dans la table Priorites).');
      return;
    }
    if (el.hasAttribute('data-appliquer-vue')) {
      var nv = (document.querySelector('input[name="vue-niveau"]:checked') || {}).value || 'equipe';
      var eq = (document.getElementById('vue-equipe') || {}).value || '';
      choisirVue(nv, eq).then(function (ok) {
        if (configLab) configLab.message(ok ? 'success' : 'info', ok ? 'Niveau appliqué à cette vue. Pour le garder, cliquez sur Enregistrer en haut à droite de la vue Grist.' : 'Niveau appliqué pour cette session (démonstration).');
        etat.ecran = 0; brouillon = null; ouvrirBrouillonVue(); return charger();
      }).then(function () { rendre(); if (configLab) configLab.rafraichir('reglages'); }).catch(function (err) { if (configLab) configLab.message('error', String((err && err.message) || err)); });
      return;
    }
    if (el.hasAttribute('data-deux-niveaux')) { el.disabled = true; preparerDeuxNiveaux(el.getAttribute('data-deux-niveaux')); return; }
    if (el.hasAttribute('data-signalement')) {
      var id = num(el.getAttribute('data-signalement')), f = el.getAttribute('data-faire');
      var s = (data.Signalements || []).filter(function (x) { return x.id === id; })[0];
      if (f === 'resoudre') { etat.resolution = id; rendre(); var i = document.getElementById('res-' + id); if (i) i.focus(); return; }
      if (f === 'encours') executer([['UpdateRecord', 'Signalements', id, { Statut: 'En cours' }]], 'Signalement pris en charge.');
      if (f === 'escalader') {
        var n = C.escalade[C.escalade.indexOf(s.Escalade) + 1] || C.escalade[0];
        executer([['UpdateRecord', 'Signalements', id, { Escalade: n }]], 'Signalement escaladé à : ' + n + '.');
      }
      return;
    }
    var ra = el.getAttribute('data-r-action');
    if (ra && brouillon) {
      var idx = num(el.getAttribute('data-r-index')), l = el.getAttribute('data-r-liste');
      if (ra === 'supprimer') chemin(brouillon, l).splice(idx, 1);
      else if (ra === 'monter' && idx > 0) { var arr = chemin(brouillon, l); arr.splice(idx - 1, 0, arr.splice(idx, 1)[0]); }
      else if (ra === 'ajouter-zone') { brouillon.ecrans[idx].zones = brouillon.ecrans[idx].zones || []; brouillon.ecrans[idx].zones.push({ type: 'texte', largeur: 6 }); }
      else if (ra === 'ajouter-ecran') brouillon.ecrans.push({ titre: 'Nouvel écran', zones: [] });
      else if (ra === 'auto') brouillon.ecrans = JSON.parse(JSON.stringify(ecransAuto()));
      rendreReglagesEnGardant();
    }
  });

  // Les réglages de l'en-tête sont dans le brouillon : on les garde en redessinant.
  function rendreReglagesEnGardant() { var y = window.scrollY; if (configLab) { configLab.rafraichir('reglages'); configLab.modifie(true); } window.scrollTo(0, y); }

  ecoute.addEventListener('input', function (e) {
    var el = e.target;
    if (el.hasAttribute('data-sig')) { etat.brouillons.sig = etat.brouillons.sig || {}; etat.brouillons.sig[el.getAttribute('data-sig')] = el.value; }
    if (el.hasAttribute('data-prio')) { etat.brouillons.prio = etat.brouillons.prio || {}; etat.brouillons.prio[el.getAttribute('data-prio')] = el.value; }
    if (el.hasAttribute('data-r') && brouillon && !el.hasAttribute('data-r-rendre') && el.type !== 'checkbox') {
      poser(brouillon, el.getAttribute('data-r'), el.getAttribute('data-r-type') === 'nombre' ? num(el.value) : el.value);
    }
  });
  ecoute.addEventListener('change', function (e) {
    var el = e.target;
    if (el.hasAttribute('data-sig')) { etat.brouillons.sig = etat.brouillons.sig || {}; etat.brouillons.sig[el.getAttribute('data-sig')] = el.value; }
    if (el.hasAttribute('data-prio')) { etat.brouillons.prio = etat.brouillons.prio || {}; etat.brouillons.prio[el.getAttribute('data-prio')] = el.value; }
    if (el.hasAttribute('data-action-table')) {
      executer([['UpdateRecord', el.getAttribute('data-action-table'), num(el.getAttribute('data-action-id')), { Etat: el.value }]], 'État de l\'action mis à jour.');
      return;
    }
    if (el.hasAttribute('data-r') && brouillon) {
      var v = el.getAttribute('data-r-type') === 'case' ? el.checked : el.getAttribute('data-r-type') === 'nombre' ? num(el.value) : el.value;
      poser(brouillon, el.getAttribute('data-r'), v);
      if (el.hasAttribute('data-r-rendre')) rendreReglagesEnGardant();
    }
  });
  app.addEventListener('toggle', function (e) {
    if (e.target.matches && e.target.matches('details.mg-saisie') && e.target.querySelector('[data-form="meteo"]')) etat.saisieOuverte = e.target.open;
  }, true);

  app.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, type = f.getAttribute('data-form');
    if (type === 'meteo') {
      var auj = aujourdhui(), actions = [];
      C.rubriques.forEach(function (r, i) {
        var choisi = f.querySelector('input[name="mt-' + i + '"]:checked');
        var com = document.getElementById('mtc-' + i).value.trim();
        if (!choisi) return;
        var m = meteoDu(auj, r), champs = { Date: auj, Rubrique: r, Statut: choisi.value, Commentaire: com };
        if (m) { if (m.Statut !== champs.Statut || (m.Commentaire || '') !== com) actions.push(['UpdateRecord', 'Meteo', m.id, { Statut: champs.Statut, Commentaire: com }]); }
        else actions.push(['AddRecord', 'Meteo', null, champs]);
      });
      if (!actions.length) { etat.alerte = { type: 'error', texte: 'Choisissez au moins un statut.' }; rendre(); return; }
      etat.saisieOuverte = false;
      executer(actions, 'Météo du jour enregistrée.');
      return;
    }
    if (type === 'signalement') {
      var b = etat.brouillons.sig || {};
      if (!String(b.Titre || '').trim()) return;
      var sig = { Titre: String(b.Titre).trim(), Rubrique: b.Rubrique || C.rubriques[0], Gravite: b.Gravite || 'Mineure',
        Description: b.Description || '', Statut: 'Ouvert', Escalade: C.escalade[0] };
      if (aColonne('Signalements', 'Nature') || DEMO) sig.Nature = b.Nature || NATURES[0];
      if (vue.equipe && (aColonne('Signalements', 'Equipe') || DEMO)) sig.Equipe = vue.equipe;
      executer([['AddRecord', 'Signalements', null, sig]], sig.Nature === NATURES[1] ? 'Demande d\'arbitrage enregistrée. Escaladez-la pour qu\'elle arrive au pilotage.' : 'Problème signalé.').then(function () { etat.brouillons.sig = {}; });
      return;
    }
    if (type === 'priorite') {
      var bp = etat.brouillons.prio || {};
      if (!String(bp.Titre || '').trim()) return;
      var pr = { Titre: String(bp.Titre).trim(), Detail: bp.Detail || '', Type: bp.Type || TYPES_PRIORITE[1], Debut: aujourdhui(), Fin: bp.Fin ? saisieVersDate(bp.Fin) : null };
      if (vue.equipe) pr.Equipe = vue.equipe;
      executer([['AddRecord', 'Priorites', null, pr]], 'Publié.').then(function () { etat.brouillons.prio = {}; });
      return;
    }
    if (type === 'charge') {
      var nc = f.querySelector('input[name="ch-niveau"]:checked');
      if (!nc) { etat.alerte = { type: 'error', texte: 'Choisissez un niveau de charge.' }; rendre(); return; }
      var ch = { Semaine: lundi(aujourdhui()), Niveau: nc.value, Raison: document.getElementById('ch-raison').value.trim(), Nominatif: document.getElementById('ch-nom').checked };
      if (vue.equipe) ch.Equipe = vue.equipe;
      etat.brouillons.charge = {};
      executer([['AddRecord', 'Charge', null, ch]], 'Merci, votre réponse est enregistrée' + (ch.Nominatif ? ' avec votre nom.' : ' sans votre nom.'));
      return;
    }
    if (type === 'tension') {
      var nt = f.querySelector('input[name="te-niveau"]:checked');
      if (!nt) { etat.alerte = { type: 'error', texte: 'Choisissez un niveau de tension.' }; rendre(); return; }
      executer([['AddRecord', 'Tensions_charge', null, { Semaine: lundi(aujourdhui()), Equipe: vue.equipe || '', Tension: nt.value, Commentaire: document.getElementById('te-com').value.trim() }]], 'Tension de charge enregistrée : le niveau Pilotage la voit.');
      return;
    }
    if (type === 'decision') {
      var it = document.getElementById('dc-int').value.trim();
      if (!it) return;
      var etats = choixDe('Actions_reunion', 'Etat');
      var ac = { Intitule: it, Responsable: document.getElementById('dc-resp').value.trim(), Echeance: saisieVersDate(document.getElementById('dc-ech').value) };
      if (etats.length || DEMO) ac.Etat = etats[0] || 'À faire';
      if (vue.equipe && (aColonne('Actions_reunion', 'Equipe') || DEMO)) ac.Equipe = vue.equipe;
      executer([['AddRecord', 'Actions_reunion', null, ac]], 'Action notée.');
      return;
    }
    if (type === 'resoudre') {
      var id = num(f.getAttribute('data-id')), txt = document.getElementById('res-' + id).value.trim();
      etat.resolution = null;
      executer([['UpdateRecord', 'Signalements', id, { Statut: 'Résolu', Resolution: txt, Resolu_le: Date.now() / 1000 }]], 'Signalement résolu.');
    }
  });

  window.addEventListener('hashchange', function () { etat.alerte = null; if (configLab && configLab.ongletActif() !== 'apercu') configLab.onglet(location.hash === '#reglages' ? 'reglages' : 'vue'); rendre(); });

  // ---------------------------------------------------------------------------
  // Thème et démarrage
  // ---------------------------------------------------------------------------

  function appliquerTheme() {
    var st = getComputedStyle(document.documentElement);
    var m = (st.getPropertyValue('--grist-theme-page-bg') || '').trim().match(/^#([0-9a-f]{6})$/i), t = 'light';
    if (m) { var n = parseInt(m[1], 16); t = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 < 0.5 ? 'dark' : 'light'; }
    else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) t = 'dark';
    document.documentElement.setAttribute('data-fr-theme', t);
  }
  new MutationObserver(appliquerTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
  appliquerTheme();

  function erreur(err) {
    app.innerHTML = '<div class="fr-alert fr-alert--error"><h2 class="fr-alert__title">Chargement impossible</h2><p>Vérifiez que le widget a l\'accès « Accès complet au document ». Détail : ' + esc((err && err.message) || err) + '</p></div>';
  }
  function rendreSiLibre() {
    var a = document.activeElement;
    if (a && app.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
    rendre();
  }

  if (DEMO) {
    document.getElementById('mg-demo').hidden = false;
    charger().then(rendre).catch(erreur);
  } else {
    grist.ready({ requiredAccess: 'full', allowSelectBy: false });
    var attente = null;
    grist.onRecords(function () {
      clearTimeout(attente);
      attente = setTimeout(function () { charger().then(function () { appliquerTheme(); rendreSiLibre(); }).catch(erreur); }, 150);
    });
    setInterval(function () { if (!document.hidden && !etat.affichage) charger().then(rendreSiLibre).catch(function () {}); }, 120000);
  }
})();

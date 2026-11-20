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
  var DEFAUTS = {
    rubriques: ['Santé et sécurité', 'Qualité de service', 'Délais', 'Moyens', 'Équipe'],
    escalade: ['Équipe', 'Encadrement', 'Direction'],
    joursMeteo: 10, delaiSignalement: 5, rotation: 30
  };
  var TYPES_ZONE = [
    ['synthese', 'Chiffres clés'], ['meteo', 'Météo du jour'], ['signalements', 'Signalements'],
    ['actions', 'Actions à suivre'], ['reunion', 'Prochaine réunion'], ['projets', 'Projets par phase'],
    ['tableau', 'Tableau de bord grist-graphique'], ['texte', 'Message libre']
  ];
  var LARGEURS = [[4, 'Un tiers'], [6, 'Moitié'], [8, 'Deux tiers'], [12, 'Pleine largeur']];

  var DEMO = window.self === window.top;
  var C = {};              // configuration en vigueur
  var reglages = {};       // configuration enregistrée
  var meta = { tables: [], colonnes: [], colConfig: false };
  var data = {};
  var etat = { ecran: 0, alerte: null, affichage: false, resolution: null, brouillons: {}, tableaux: [] };
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
    var z1 = [{ type: 'synthese', largeur: 12 }];
    if (s.meteo) z1.push({ type: 'meteo', largeur: 7 });
    if (s.signalements) z1.push({ type: 'signalements', largeur: 5 });
    if (s.actionsReunion || s.actionsProjet) z1.push({ type: 'actions', largeur: 12 });
    e.push({ titre: "Aujourd'hui", zones: z1 });
    var z2 = [];
    if (s.reunions) z2.push({ type: 'reunion', largeur: s.projets ? 4 : 12 });
    if (s.projets) z2.push({ type: 'projets', largeur: s.reunions ? 8 : 12 });
    if (z2.length) e.push({ titre: 'Projets et réunions', zones: z2 });
    s.tableaux.slice(0, 3).forEach(function (t) { e.push({ titre: t.titre, zones: [{ type: 'tableau', largeur: 12, tableau: t.cle }] }); });
    return e;
  }
  function ecrans() { return Array.isArray(C.ecrans) && C.ecrans.length ? C.ecrans : ecransAuto(); }

  // ---------------------------------------------------------------------------
  // Chargement
  // ---------------------------------------------------------------------------

  var TABLES_LUES = ['Meteo', 'Signalements', 'Reunions', 'Points', 'Actions_reunion', 'Projets', 'Actions', 'Personnes'];

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
          Object.keys(o).forEach(function (k) { if (typeof o[k] === 'string' && /^J[+-]\d+$/.test(o[k])) o[k] = auj + 86400 * (+o[k].slice(1)); });
          return o;
        });
      });
      appliquerReglages({ page: { titre: 'Management visuel', sousTitre: 'Démonstration' } });
      etat.tableaux = [{ cle: 'demo:0', hote: 'demo', index: 0, titre: 'Activité (grist-graphique)' }];
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
      return Promise.all(TABLES_LUES.filter(aTable).map(function (t) {
        return grist.docApi.fetchTable(t).then(function (x) { data[t] = enLignes(x); }).catch(function () { data[t] = []; });
      }));
    });
  }

  function charger() { return DEMO ? chargerDemo() : chargerGrist(); }

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
    return (data.Meteo || []).filter(function (m) { return m.Date === jour && m.Rubrique === rubrique; })[0] || null;
  }
  function statutMeteo(nom) { return STATUTS_METEO.filter(function (s) { return s.nom === nom; })[0] || null; }

  function signalementsOuverts() {
    return (data.Signalements || []).filter(function (s) { return s.Statut !== 'Résolu'; }).sort(function (a, b) {
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
        res.push({ table: 'Actions_reunion', id: a.id, source: 'Réunion', origine: r ? r.Titre + (r.Date ? ' du ' + dateTexte(r.Date) : '') : '', intitule: a.Intitule,
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
    if (s.meteo) {
      var crit = C.rubriques.filter(function (r) { var m = meteoDu(auj, r); return m && m.Statut === 'Critique'; }).length;
      var non = C.rubriques.filter(function (r) { return !meteoDu(auj, r); }).length;
      ch.push({ n: crit, lib: 'rubrique' + (crit > 1 ? 's' : '') + ' en critique aujourd\'hui', statut: crit ? 'rouge' : 'vert' });
      if (non) ch.push({ n: non, lib: 'rubrique' + (non > 1 ? 's' : '') + ' sans météo aujourd\'hui', statut: 'orange' });
    }
    if (s.signalements) {
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

  function zoneSignalements() {
    var ouv = signalementsOuverts(), delai = num(C.delaiSignalement);
    var h = '';
    if (!ouv.length) h += '<p class="mg-vide">Aucun signalement ouvert.</p>';
    else h += '<ul class="mg-signalements">' + ouv.slice(0, 12).map(function (s) {
      var age = ageSignalement(s), horsDelai = delai && age > delai;
      var niv = C.escalade.indexOf(s.Escalade);
      h = '<li class="mg-signalement mg-gravite--' + (COULEUR_GRAVITE[s.Gravite] || 'info') + '"><p class="mg-signalement__titre">' + esc(s.Titre) + '</p>' +
        '<p class="mg-signalement__meta">' + badge(s.Gravite, COULEUR_GRAVITE[s.Gravite]) + ' ' + badge(s.Statut, s.Statut === 'En cours' ? 'info' : '') + ' ' + (s.Rubrique ? badge(s.Rubrique) : '') +
        (niv > 0 ? ' ' + badge('Escaladé : ' + s.Escalade, 'new') : '') + '</p>' +
        '<p class="mg-signalement__info">Ouvert depuis ' + age + ' jour' + (age > 1 ? 's' : '') + (horsDelai ? ' · <strong class="mg-texte-erreur">délai de ' + delai + ' jours dépassé</strong>' : '') +
        (s.Responsable ? ' · suivi par ' + esc(s.Responsable) : '') + '</p>';
      if (etat.resolution === s.id) {
        h += '<form data-form="resoudre" data-id="' + s.id + '" class="mg-saisie">' +
          '<div class="fr-input-group"><label class="fr-label" for="res-' + s.id + '">Comment le problème a-t-il été résolu ?</label><input class="fr-input" id="res-' + s.id + '" required></div>' +
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
    var b = etat.brouillons.sig || {};
    h += '<details class="mg-saisie fr-mt-2w"><summary>Signaler un problème</summary><form data-form="signalement" class="fr-mt-2w">' +
      '<div class="fr-input-group"><label class="fr-label" for="sg-titre">Problème constaté</label><input class="fr-input" id="sg-titre" data-sig="Titre" value="' + esc(b.Titre || '') + '" required></div>' +
      '<div class="mg-deux"><div class="fr-select-group"><label class="fr-label" for="sg-rub">Rubrique</label><select class="fr-select" id="sg-rub" data-sig="Rubrique">' + C.rubriques.map(function (r) { return '<option' + (b.Rubrique === r ? ' selected' : '') + '>' + esc(r) + '</option>'; }).join('') + '</select></div>' +
      '<div class="fr-select-group"><label class="fr-label" for="sg-grav">Gravité</label><select class="fr-select" id="sg-grav" data-sig="Gravite">' + GRAVITES.slice().reverse().map(function (g) { return '<option' + ((b.Gravite || 'Mineure') === g ? ' selected' : '') + '>' + esc(g) + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="fr-input-group"><label class="fr-label" for="sg-desc">Précisions (facultatif)</label><textarea class="fr-input" id="sg-desc" rows="2" data-sig="Description">' + esc(b.Description || '') + '</textarea></div>' +
      '<button type="submit" class="fr-btn">Signaler</button></form></details>';
    return h;
  }

  function zoneActions(z) {
    var auj = aujourdhui(), semaine = auj + 7 * 86400;
    var acts = toutesActions().filter(function (a) { return !z.source || z.source === a.source; });
    if (!acts.length) return '<p class="mg-vide">Aucune action ouverte.</p>';
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
    }).join('') + '</div>';
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
      var source = DEMO ? window.Donnees.sourceDemo('../grist-graphique/exemples/demo.json') : window.Donnees.sourceWidget();
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
    var s = sources(), titre = z.titre || (TYPES_ZONE.filter(function (t) { return t[0] === z.type; })[0] || [0, ''])[1], corps;
    if (z.type === 'synthese') corps = zoneSynthese();
    else if (z.type === 'meteo') corps = s.meteo ? zoneMeteo() : manque('la table Meteo');
    else if (z.type === 'signalements') corps = s.signalements ? zoneSignalements() : manque('la table Signalements');
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
    if (location.hash === '#reglages') { app.innerHTML = vueReglages(); monterReglagesPage(); return; }
    if (!DEMO && (!aTable('Meteo') || !aTable('Signalements'))) { app.innerHTML = vueInstallation(); return; }
    var ec = ecrans();
    if (etat.ecran >= ec.length) etat.ecran = 0;
    var e = ec[etat.ecran];
    var h = '<div class="mg-barre"><nav class="mg-ecrans" aria-label="Écrans"><ul class="fr-btns-group fr-btns-group--inline-sm fr-btns-group--sm">' +
      ec.map(function (x, i) { return '<li><button type="button" class="fr-btn' + (i === etat.ecran ? '' : ' fr-btn--secondary') + '" data-ecran="' + i + '"' + (i === etat.ecran ? ' aria-current="page"' : '') + '>' + esc(x.titre || 'Écran ' + (i + 1)) + '</button></li>'; }).join('') +
      '</ul></nav><p class="mg-horloge" aria-hidden="true"></p>' +
      '<button type="button" class="fr-btn fr-btn--sm fr-btn--tertiary fr-icon-fullscreen-line fr-btn--icon-left mg-bouton-affichage" data-action="affichage">' + (etat.affichage ? 'Quitter le mode affichage' : 'Mode affichage') + '</button></div>' +
      blocAlerte() + '<div class="mg-grille">' + (e.zones || []).map(rendreZone).join('') + '</div>';
    app.innerHTML = h;
    majHorloge();
    monterTableaux();
  }

  // ---------------------------------------------------------------------------
  // Installation
  // ---------------------------------------------------------------------------

  function vueInstallation() {
    return '<h1 class="fr-h3">Installer l\'espace de management visuel</h1>' + blocAlerte() +
      '<p>Le widget va créer deux tables dans ce document : <code>Meteo</code> (la météo du jour par rubrique) et <code>Signalements</code> (les problèmes et leur escalade). Les tables existantes ne sont pas modifiées.</p>' +
      '<p>Il affichera aussi, s\'ils sont dans ce document, les tableaux de bord de <strong>grist-graphique</strong>, les réunions et actions de <strong>grist-reunion</strong> et les projets de <strong>grist-projet</strong>.</p>' +
      '<p class="fr-text--sm">À faire par un propriétaire du document. Le widget doit avoir l\'accès complet au document.</p>' +
      '<ul class="fr-btns-group fr-btns-group--inline-md"><li><button type="button" class="fr-btn" data-installer="vide">Créer les tables</button></li>' +
      '<li><button type="button" class="fr-btn fr-btn--secondary" data-installer="exemple">Créer les tables avec un exemple fictif</button></li></ul>';
  }

  function choix(l) { return { type: 'Choice', widgetOptions: JSON.stringify({ choices: l }) }; }
  function installer(exemple) {
    var sch = {
      Meteo: [['Date', { type: 'Date' }], ['Rubrique', choix(C.rubriques)], ['Statut', { type: 'Choice', widgetOptions: JSON.stringify({ choices: STATUTS_METEO.map(function (s) { return s.nom; }), choiceOptions: COULEURS_GRIST }) }],
        ['Commentaire', { type: 'Text' }], ['Saisi_par', { type: 'Text', isFormula: false, formula: 'user.Name' }], [NOM_COLONNE_CONFIG, { type: 'Text' }]],
      Signalements: [['Titre', { type: 'Text' }], ['Description', { type: 'Text' }], ['Rubrique', choix(C.rubriques)], ['Gravite', { type: 'Choice', widgetOptions: JSON.stringify({ choices: GRAVITES, choiceOptions: COULEURS_GRIST }) }],
        ['Statut', choix(STATUTS_SIGNALEMENT)], ['Escalade', choix(C.escalade)], ['Responsable', { type: 'Text' }], ['Resolution', { type: 'Text' }],
        ['Signale_par', { type: 'Text', isFormula: false, formula: 'user.Name' }], ['Signale_le', { type: 'DateTime:Europe/Paris', isFormula: false, formula: 'NOW()' }],
        ['Resolu_le', { type: 'DateTime:Europe/Paris' }]]
    };
    var actions = Object.keys(sch).filter(function (t) { return !aTable(t); }).map(function (t) {
      return ['AddTable', t, sch[t].map(function (c) { return Object.assign({ id: c[0] }, c[1]); })];
    });
    return grist.docApi.applyUserActions(actions).then(function () {
      if (!exemple) return null;
      return fetch('exemples/demo.json').then(function (r) { return r.json(); }).then(function (j) {
        var auj = aujourdhui(), ex = [];
        ['Meteo', 'Signalements'].forEach(function (t) {
          var lignes = j.tables[t], cols = {};
          sch[t].forEach(function (c) { if (c[0] !== NOM_COLONNE_CONFIG) cols[c[0]] = []; });
          lignes.forEach(function (l) {
            Object.keys(cols).forEach(function (k) {
              var v = l[k];
              // Sans valeur, Grist inscrirait le nom de la personne qui installe : on garde l'exemple anonyme.
              if ((k === 'Saisi_par' || k === 'Signale_par') && !v) v = 'Exemple fictif';
              if (typeof v === 'string' && /^J[+-]\d+$/.test(v)) v = auj + 86400 * (+v.slice(1));
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
    }).then(rendre).catch(function (err) {
      etat.alerte = { type: 'error', texte: 'Installation impossible : seuls les propriétaires du document peuvent créer des tables. (' + ((err && err.message) || err) + ')' };
      rendre();
    });
  }

  // ---------------------------------------------------------------------------
  // Réglages
  // ---------------------------------------------------------------------------

  var brouillon = null;
  function vueReglages() {
    if (DEMO) return '<div class="fr-alert fr-alert--info"><p>Les réglages se font dans Grist, par un propriétaire du document.</p></div><p><a class="fr-link" href="#">Retour</a></p>';
    if (!brouillon) { brouillon = JSON.parse(JSON.stringify(reglages || {})); if (!Array.isArray(brouillon.ecrans) || !brouillon.ecrans.length) brouillon.ecrans = JSON.parse(JSON.stringify(ecransAuto())); }
    var b = brouillon;
    var h = '<div class="mg-titre-ligne"><h1 class="fr-h3">Réglages de l\'espace</h1><a class="fr-link fr-icon-arrow-left-line fr-link--icon-left" href="#">Retour</a></div>' + blocAlerte() +
      '<p class="fr-text--sm">Réservé aux propriétaires du document. Enregistré dans la description de la colonne <code>' + NOM_COLONNE_CONFIG + '</code> de la table Meteo.</p>' +
      '<section><h2 class="fr-h5">Écrans</h2><p class="fr-text--sm">Chaque écran assemble des zones. En mode affichage, les écrans défilent tour à tour.</p>';
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
      '<div class="fr-checkbox-group fr-checkbox-group--sm"><input type="checkbox" id="rg-we" data-r="weekend" data-r-type="case"' + (b.weekend ? ' checked' : '') + '><label class="fr-label" for="rg-we">Afficher le samedi et le dimanche dans la météo</label></div></section>' +
      '<section class="fr-mt-3w"><h2 class="fr-h5">En-tête et pied de page</h2><div id="mg-reglages-page"></div></section>' +
      '<ul class="fr-btns-group fr-btns-group--inline-md fr-mt-3w"><li><button type="button" class="fr-btn" data-action="enregistrer-reglages">Enregistrer les réglages</button></li>' +
      '<li><button type="button" class="fr-btn fr-btn--secondary" data-action="annuler-reglages">Annuler les modifications</button></li></ul>';
    return h;
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
  function poser(o, p, v) { var k = p.split('.'), d = k.pop(); chemin(o, k.join('.'))[d] = v; }
  function monterReglagesPage() {
    var z = document.getElementById('mg-reglages-page');
    if (!z || !window.PageEditeur || !brouillon) return;
    brouillon.page = brouillon.page || { marque: '', titre: 'Management visuel', pied: { accessibilite: '' } };
    window.PageEditeur.monter(z, brouillon.page, function () {});
  }
  function enregistrerReglages() {
    var b = brouillon;
    function lignes(id) { return document.getElementById(id).value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean); }
    b.rubriques = lignes('rg-rub'); b.escalade = lignes('rg-esc');
    if (!b.rubriques.length) delete b.rubriques;
    if (!b.escalade.length) delete b.escalade;
    var actions = [];
    if (!meta.colConfig) actions.push(['AddColumn', 'Meteo', NOM_COLONNE_CONFIG, { type: 'Text' }]);
    actions.push(['ModifyColumn', 'Meteo', NOM_COLONNE_CONFIG, { description: JSON.stringify(b) }]);
    [['Meteo', 'Rubrique', b.rubriques || DEFAUTS.rubriques], ['Signalements', 'Rubrique', b.rubriques || DEFAUTS.rubriques], ['Signalements', 'Escalade', b.escalade || DEFAUTS.escalade]].forEach(function (x) {
      var col = colonnesDe(x[0]).filter(function (c) { return c.colId === x[1]; })[0];
      if (!col) return;
      var o = {}; try { o = JSON.parse(col.widgetOptions || '{}'); } catch (e) { o = {}; }
      o.choices = x[2];
      actions.push(['ModifyColumn', x[0], x[1], { widgetOptions: JSON.stringify(o) }]);
    });
    grist.docApi.applyUserActions(actions).then(function () {
      brouillon = null; etat.alerte = { type: 'success', texte: 'Réglages enregistrés.' };
      return charger();
    }).then(function () { location.hash = ''; rendre(); }).catch(function (err) {
      etat.alerte = { type: 'error', texte: 'Enregistrement impossible : seuls les propriétaires du document peuvent modifier les réglages. (' + ((err && err.message) || err) + ')' };
      rendre();
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

  app.addEventListener('click', function (e) {
    var el = e.target.closest('button');
    if (!el) return;
    var a = el.getAttribute('data-action');
    if (el.hasAttribute('data-ecran')) { etat.ecran = num(el.getAttribute('data-ecran')); etat.alerte = null; rendre(); return; }
    if (a === 'affichage') { basculerAffichage(!etat.affichage); return; }
    if (a === 'annuler-resolution') { etat.resolution = null; rendre(); return; }
    if (a === 'enregistrer-reglages') { enregistrerReglages(); return; }
    if (a === 'annuler-reglages') { brouillon = null; location.hash = ''; return; }
    if (el.hasAttribute('data-installer')) { el.disabled = true; installer(el.getAttribute('data-installer') === 'exemple'); return; }
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
  function rendreReglagesEnGardant() { var y = window.scrollY; app.innerHTML = vueReglages(); monterReglagesPage(); window.scrollTo(0, y); }

  app.addEventListener('input', function (e) {
    var el = e.target;
    if (el.hasAttribute('data-sig')) { etat.brouillons.sig = etat.brouillons.sig || {}; etat.brouillons.sig[el.getAttribute('data-sig')] = el.value; }
    if (el.hasAttribute('data-r') && brouillon && !el.hasAttribute('data-r-rendre') && el.type !== 'checkbox') {
      poser(brouillon, el.getAttribute('data-r'), el.getAttribute('data-r-type') === 'nombre' ? num(el.value) : el.value);
    }
  });
  app.addEventListener('change', function (e) {
    var el = e.target;
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
      executer([['AddRecord', 'Signalements', null, { Titre: String(b.Titre).trim(), Rubrique: b.Rubrique || C.rubriques[0], Gravite: b.Gravite || 'Mineure',
        Description: b.Description || '', Statut: 'Ouvert', Escalade: C.escalade[0] }]], 'Problème signalé.').then(function () { etat.brouillons.sig = {}; });
      return;
    }
    if (type === 'resoudre') {
      var id = num(f.getAttribute('data-id')), txt = document.getElementById('res-' + id).value.trim();
      etat.resolution = null;
      executer([['UpdateRecord', 'Signalements', id, { Statut: 'Résolu', Resolution: txt, Resolu_le: Date.now() / 1000 }]], 'Signalement résolu.');
    }
  });

  window.addEventListener('hashchange', function () { etat.alerte = null; brouillon = null; rendre(); });

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
    if (location.hash === '#reglages') return;
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

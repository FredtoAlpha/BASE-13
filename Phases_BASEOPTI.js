/**
 * ===================================================================
 * PHASES 1-2-3 - VERSION BASEOPTI
 * ===================================================================
 *
 * Ces phases piochent exclusivement dans _BASEOPTI au lieu de lire
 * directement depuis les onglets TEST/CACHE/FIN
 *
 * Architecture :
 * - Phase 1 : Place les élèves avec OPT/LV2 spécifiques selon quotas
 * - Phase 2 : Applique codes ASSO/DISSO en respectant OPT/LV2
 * - Phase 3 : Complète effectifs + parité depuis le pool restant
 */

// ===================================================================
// PHASE 1 - OPTIONS & LV2 (version BASEOPTI)
// ===================================================================

/**
 * Phase 1 : Répartit les élèves avec Options/LV2 spécifiques
 * Pioché depuis _BASEOPTI (élèves libres)
 */
function Phase1I_dispatchOptionsLV2_BASEOPTI(ctx) {
  logLine('INFO', '='.repeat(80));
  logLine('INFO', '📌 PHASE 1 (BASEOPTI) - Options & LV2');
  logLine('INFO', '='.repeat(80));

  const free = baseGetFree_();
  logLine('INFO', '🔍 Élèves disponibles : ' + free.length);

  // 🔍 DEBUG : Compter combien d'élèves ont ITA/CHAV/etc.
  const debugCounts = { ITA: 0, CHAV: 0, ESP: 0, ALL: 0, PT: 0 };
  free.forEach(function(s) {
    const lv2 = String(s.LV2 || '').trim().toUpperCase();
    const opt = String(s.OPT || '').trim().toUpperCase();
    if (lv2 === 'ITA') debugCounts.ITA++;
    if (lv2 === 'ESP') debugCounts.ESP++;
    if (lv2 === 'ALL') debugCounts.ALL++;
    if (lv2 === 'PT') debugCounts.PT++;
    if (opt === 'CHAV') debugCounts.CHAV++;
  });
  logLine('INFO', '🔍 DEBUG - Pool : ITA=' + debugCounts.ITA + ', CHAV=' + debugCounts.CHAV +
    ', ESP=' + debugCounts.ESP + ', ALL=' + debugCounts.ALL + ', PT=' + debugCounts.PT);

  const stats = { ITA: 0, CHAV: 0, ESP: 0, ALL: 0, PT: 0 };
  const placements = {}; // { "6°1": [...students], "6°3": [...] }

  // Parcourir les quotas définis dans _STRUCTURE
  for (const classe in (ctx.quotas || {})) {
    placements[classe] = [];
    const quotas = ctx.quotas[classe];

    // 1. Placer les élèves avec OPT spécifiques (ITA, CHAV, etc.)
    for (const optName in quotas) {
      const quota = quotas[optName];
      if (quota <= 0) continue;

      // Filtrer par type de contrainte
      let candidates = [];

      if (optName === 'ITA' || optName === 'ESP' || optName === 'ALL' || optName === 'PT') {
        // LV2
        candidates = free.filter(function(s) {
          const lv2 = String(s.LV2 || '').trim().toUpperCase();
          return lv2 === optName && !s._PLACED;
        });
      } else {
        // OPT (CHAV, LATIN, etc.)
        candidates = free.filter(function(s) {
          const opt = String(s.OPT || '').trim().toUpperCase();
          return opt === optName && !s._PLACED;
        });
      }

      // Prendre les N premiers
      const picked = candidates.slice(0, quota);

      if (picked.length > 0) {
        placements[classe].push(...picked);

        // Marquer comme placés (temporairement dans free)
        picked.forEach(function(s) { s._PLACED = 'P1'; });

        // Stats
        stats[optName] = (stats[optName] || 0) + picked.length;

        logLine('INFO', '  ✅ ' + classe + ' : ' + picked.length + ' × ' + optName + ' (quota=' + quota + ')');

        if (picked.length < quota) {
          logLine('WARN', '  ⚠️ ' + classe + ' : Seulement ' + picked.length + ' ' + optName + ' trouvés sur ' + quota + ' demandés');
        }
      }
    }
  }

  // Écrire dans les onglets CACHE et marquer dans _BASEOPTI
  for (const classe in placements) {
    const students = placements[classe];
    if (students.length === 0) continue;

    writeBatchToCache_(ctx, classe, students);
    baseMarkPlaced_(grpsIds_(students), 'P1', classe);
  }

  SpreadsheetApp.flush();

  logLine('INFO', '✅ PHASE 1 terminée : ' + Object.keys(stats).map(function(k) {
    return k + '=' + stats[k];
  }).join(', '));

  return {
    ok: true,
    counts: stats,
    warnings: []
  };
}

// ===================================================================
// PHASE 2 - CODES ASSO/DISSO (version BASEOPTI)
// ===================================================================

/**
 * Phase 2 : Applique les codes ASSO (A) et DISSO (D)
 * Règle critique : Si un groupe A a un élève avec OPT/LV2 contraignant,
 * TOUS les élèves du groupe vont dans la classe correspondante
 */
function Phase2I_applyDissoAsso_BASEOPTI(ctx) {
  logLine('INFO', '='.repeat(80));
  logLine('INFO', '📌 PHASE 2 (BASEOPTI) - Codes ASSO/DISSO');
  logLine('INFO', '='.repeat(80));

  const free = baseGetFree_();
  logLine('INFO', '🔍 Élèves disponibles : ' + free.length);

  // 🔍 DEBUG : Compter les codes A dans le pool
  let debugCodesA = 0;
  free.forEach(function(s) {
    if (s.A && String(s.A).trim() !== '') debugCodesA++;
  });
  logLine('INFO', '🔍 DEBUG - Élèves avec CODE_A : ' + debugCodesA);

  let assoCount = 0;
  let dissoCount = 0;

  // ===============================================
  // 1. TRAITER LES CODES ASSO (A)
  // ===============================================

  // Regrouper par A (code ASSO)
  const groupsA = {};
  free.forEach(function(s) {
    const codeA = String(s.A || '').trim().toUpperCase();
    if (codeA) {
      if (!groupsA[codeA]) groupsA[codeA] = [];
      groupsA[codeA].push(s);
    }
  });

  logLine('INFO', '🔗 Groupes ASSO détectés : ' + Object.keys(groupsA).length);

  // Traiter chaque groupe A
  for (const code in groupsA) {
    const grp = groupsA[code];

    logLine('INFO', '  🔗 Groupe A=' + code + ' : ' + grp.length + ' élèves');

    if (grp.length <= 1) {
      logLine('INFO', '    ⏭️ Groupe à 1 élève, ignoré');
      continue; // Pas besoin de regrouper si seul
    }

    // RÈGLE CRITIQUE : Déterminer la classe cible selon les contraintes OPT/LV2
    let targetClass = null;
    const constraints = [];

    grp.forEach(function(s) {
      const opt = String(s.OPT || '').trim().toUpperCase();
      const lv2 = String(s.LV2 || '').trim().toUpperCase();

      if (opt === 'CHAV') constraints.push({ type: 'OPT', value: 'CHAV', target: '6°3' });
      else if (lv2 === 'ITA') constraints.push({ type: 'LV2', value: 'ITA', target: '6°1' });
      else if (opt === 'LATIN') constraints.push({ type: 'OPT', value: 'LATIN', target: null }); // À définir
      // Ajouter d'autres mappings OPT/LV2 → classe si nécessaire
    });

    // Si au moins une contrainte forte → utiliser cette classe
    if (constraints.length > 0) {
      targetClass = constraints[0].target;
      logLine('INFO', '    ✅ Contrainte détectée : ' + constraints[0].type + '=' + constraints[0].value + ' → ' + targetClass);
    } else {
      // ✅ CORRECTION : Même sans contrainte, on place le groupe ASSO dans une classe
      // Trouver la classe avec le moins d'élèves pour équilibrer
      targetClass = findLeastPopulatedClass_(ctx);
      logLine('INFO', '    ⚖️ Pas de contrainte → placement équilibré dans ' + targetClass);
    }

    // Placer le groupe A dans la classe choisie
    if (targetClass) {
      writeBatchToCache_(ctx, targetClass, grp);
      baseMarkPlaced_(grpsIds_(grp), 'P2', targetClass);
      assoCount += grp.length;
      logLine('INFO', '    ✅ Groupe A=' + code + ' placé dans ' + targetClass + ' (' + grp.length + ' élèves)');
    }
  }

  // ===============================================
  // 2. TRAITER LES CODES DISSO (D)
  // ===============================================

  // Regrouper par D (code DISSO)
  const groupsD = {};
  const freeCopy = baseGetFree_(); // Re-lire pour inclure ceux non placés par ASSO

  freeCopy.forEach(function(s) {
    const codeD = String(s.D || '').trim().toUpperCase();
    if (codeD) {
      if (!groupsD[codeD]) groupsD[codeD] = [];
      groupsD[codeD].push(s);
    }
  });

  logLine('INFO', '🚫 Groupes DISSO détectés : ' + Object.keys(groupsD).length);

  // Pour chaque groupe D, s'assurer qu'ils vont dans des classes différentes
  for (const code in groupsD) {
    const grp = groupsD[code];
    if (grp.length <= 1) continue; // Pas de contrainte si seul

    logLine('INFO', '  🚫 Groupe D=' + code + ' : ' + grp.length + ' élèves à séparer');

    // Stratégie simple : placer chaque élève dans une classe différente
    // en respectant les contraintes OPT/LV2
    const usedClasses = {};

    grp.forEach(function(s) {
      // Trouver une classe cible qui respecte OPT/LV2
      let targetClass = findBestClassForStudent_(ctx, s, usedClasses);

      if (targetClass) {
        writeBatchToCache_(ctx, targetClass, [s]);
        baseMarkPlaced_([s._ID], 'P2', targetClass);
        usedClasses[targetClass] = true;
        dissoCount++;
        logLine('INFO', '    ✅ ' + s.NOM + ' ' + s.PRENOM + ' → ' + targetClass);
      } else {
        logLine('WARN', '    ⚠️ Impossible de placer ' + s.NOM + ' ' + s.PRENOM + ' (contrainte DISSO)');
      }
    });
  }

  SpreadsheetApp.flush();

  logLine('INFO', '✅ PHASE 2 terminée : ' + assoCount + ' ASSO, ' + dissoCount + ' DISSO');

  return {
    ok: true,
    disso: dissoCount,
    asso: assoCount
  };
}

/**
 * Compte le nombre de F et M actuellement dans une classe CACHE
 */
function getCurrentParity_(ctx, targetClass) {
  const ss = ctx.ss || SpreadsheetApp.getActive();
  const cacheName = targetClass + 'CACHE';
  const sh = ss.getSheetByName(cacheName);

  if (!sh || sh.getLastRow() < 2) {
    return { F: 0, M: 0 };
  }

  const data = sh.getDataRange().getValues();
  const headers = data[0];
  const idxSexe = headers.indexOf('SEXE');

  if (idxSexe === -1) {
    return { F: 0, M: 0 };
  }

  let countF = 0, countM = 0;
  for (let i = 1; i < data.length; i++) {
    const sexe = String(data[i][idxSexe] || '').toUpperCase();
    if (sexe === 'F') countF++;
    else if (sexe === 'M') countM++;
  }

  return { F: countF, M: countM };
}

/**
 * Trouve la classe avec le plus grand BESOIN (target - current)
 * ✅ Tient compte des effectifs cibles depuis _STRUCTURE
 */
function findLeastPopulatedClass_(ctx) {
  const needs = getClassNeedsFromCache_(ctx);

  let bestClass = null;
  let maxNeed = -1;
  let minFillRate = Infinity; // Taux de remplissage (current/target)

  for (const classe in needs) {
    const info = needs[classe];

    // Priorité 1 : Classe avec le plus grand besoin
    if (info.need > maxNeed) {
      maxNeed = info.need;
      bestClass = classe;
      minFillRate = info.target > 0 ? info.current / info.target : 0;
    }
    // Priorité 2 : Si même besoin, choisir le plus faible taux de remplissage
    else if (info.need === maxNeed) {
      const fillRate = info.target > 0 ? info.current / info.target : 0;
      if (fillRate < minFillRate) {
        minFillRate = fillRate;
        bestClass = classe;
      }
    }
  }

  return bestClass || '6°1'; // Fallback
}

/**
 * Trouve la meilleure classe pour un élève selon ses OPT/LV2
 * en évitant les classes déjà utilisées (pour DISSO)
 * ✅ CORRECTION CRITIQUE : Vérifie que la classe NE CONTIENT PAS déjà un élève avec le même code D
 */
function findBestClassForStudent_(ctx, student, usedClasses) {
  const opt = String(student.OPT || '').trim().toUpperCase();
  const lv2 = String(student.LV2 || '').trim().toUpperCase();
  const codeD = String(student.D || '').trim().toUpperCase();

  // Mapping OPT/LV2 → classe préférentielle
  const preferredClass =
    (opt === 'CHAV') ? '6°3' :
    (lv2 === 'ITA') ? '6°1' :
    null;

  // ✅ FONCTION HELPER : Vérifie si une classe contient déjà un élève avec le code D
  const classHasCodeD = function(className, codeD) {
    if (!codeD) return false;

    const cacheName = className + 'CACHE';
    const sh = (ctx.ss || SpreadsheetApp.getActive()).getSheetByName(cacheName);

    if (!sh || sh.getLastRow() < 2) return false;

    const data = sh.getDataRange().getValues();
    const headers = data[0];
    const idxD = headers.indexOf('D') >= 0 ? headers.indexOf('D') : headers.indexOf('DISSO');

    if (idxD === -1) return false;

    for (let i = 1; i < data.length; i++) {
      const rowCodeD = String(data[i][idxD] || '').trim().toUpperCase();
      if (rowCodeD === codeD) return true; // ⚠️ Classe déjà occupée par ce code D !
    }

    return false;
  };

  // Si classe préférée pas encore utilisée ET ne contient pas le code D
  if (preferredClass && !usedClasses[preferredClass] && !classHasCodeD(preferredClass, codeD)) {
    return preferredClass;
  }

  // Sinon, trouver une classe non utilisée ET sans ce code D
  const allClasses = (ctx.cacheSheets || []).map(function(name) {
    return name.replace('CACHE', '');
  });

  for (let i = 0; i < allClasses.length; i++) {
    const c = allClasses[i];
    if (!usedClasses[c] && !classHasCodeD(c, codeD)) {
      return c;
    }
  }

  // ⚠️ Aucune classe disponible sans ce code D
  logLine('ERROR', '❌ Impossible de trouver une classe pour ' + student.NOM + ' (D=' + codeD + ') - toutes les classes contiennent déjà ce code !');
  return null;
}

// ===================================================================
// PHASE 3 - COMPLÉTER EFFECTIFS & PARITÉ (version BASEOPTI)
// ===================================================================

/**
 * Phase 3 : Complète les effectifs et équilibre la parité F/M
 * Pioché depuis _BASEOPTI (élèves encore libres)
 */
function Phase3I_completeAndParity_BASEOPTI(ctx) {
  logLine('INFO', '='.repeat(80));
  logLine('INFO', '📌 PHASE 3 (BASEOPTI) - Effectifs & Parité');
  logLine('INFO', '='.repeat(80));

  const free = baseGetFree_();
  logLine('INFO', '🔍 Élèves disponibles : ' + free.length);

  // ✅ ÉTAPE 1 : Traiter les groupes A restants (non placés en Phase 2)
  const groupsA = {};
  free.forEach(function(s) {
    const codeA = String(s.A || '').trim().toUpperCase();
    if (codeA) {
      if (!groupsA[codeA]) groupsA[codeA] = [];
      groupsA[codeA].push(s);
    }
  });

  // Placer les groupes A > 1 élève ensemble
  for (const code in groupsA) {
    const grp = groupsA[code];
    if (grp.length > 1) {
      const targetClass = findLeastPopulatedClass_(ctx);
      writeBatchToCache_(ctx, targetClass, grp);
      baseMarkPlaced_(grpsIds_(grp), 'P3', targetClass);
      logLine('INFO', '  🔗 Groupe A=' + code + ' placé ensemble dans ' + targetClass + ' (' + grp.length + ' élèves)');

      // Retirer du pool free
      grp.forEach(function(s) {
        const idx = free.findIndex(function(f) { return f._ID === s._ID; });
        if (idx >= 0) free.splice(idx, 1);
      });
    }
  }

  // Calculer les besoins par classe
  const needs = getClassNeedsFromCache_(ctx);

  // ✅ Snapshot initial des besoins
  _dumpClassNeeds_(needs, '📊 État initial');

  for (const classe in needs) {
    const info = needs[classe];
    logLine('INFO', '  📊 ' + classe + ' : ' + info.current + '/' + info.target + ' (besoin: ' + info.need + ')');
  }

  // ✅ ÉTAPE 2 : Créer des pools F et M (recalculés après placement groupes A)
  let poolF = free.filter(function(s) {
    return String(s.SEXE || '').toUpperCase() === 'F';
  });

  let poolM = free.filter(function(s) {
    return String(s.SEXE || '').toUpperCase() === 'M';
  });

  logLine('INFO', '👥 Pool disponible après groupes A : ' + poolF.length + ' F, ' + poolM.length + ' M');

  // ✅ MICRO-PATCH 2 : Compteur pour traces toutes les 20 affectations
  let _allocCounter = 0;
  
  // ✅ MICRO-POINT 2 : Réinitialiser l'historique de stagnation au début de P3
  _deficitHistory_ = {};

  // Compléter chaque classe
  const classOrder = Object.keys(needs).sort(function(a, b) {
    return needs[b].need - needs[a].need; // Commencer par celles avec le plus grand besoin
  });

  for (let i = 0; i < classOrder.length; i++) {
    const classe = classOrder[i];
    let need = needs[classe].need;

    if (need <= 0) continue;

    logLine('INFO', '  🔄 Complétion de ' + classe + ' (' + need + ' élèves)');

    // ✅ CORRECTION : Compter F/M déjà présents dans CACHE
    const currentParity = getCurrentParity_(ctx, classe);
    let countF = currentParity.F;
    let countM = currentParity.M;

    const batch = [];

    while (need > 0 && (poolF.length > 0 || poolM.length > 0)) {
      // ✅ ALTERNANCE STRICTE : Choisir le sexe qui réduit l'écart |F-M|
      const wantF = countF <= countM;

      let student = null;

      if (wantF && poolF.length > 0) {
        student = poolF.shift();
        countF++; // ✅ Incrémenter immédiatement pour la prochaine itération
      } else if (!wantF && poolM.length > 0) {
        student = poolM.shift();
        countM++; // ✅ Incrémenter immédiatement
      } else if (poolF.length > 0) {
        student = poolF.shift();
        countF++;
      } else if (poolM.length > 0) {
        student = poolM.shift();
        countM++;
      }

      if (!student) break; // Plus d'élèves disponibles

      batch.push(student);
      need--;

      // ✅ MICRO-PATCH 2 : Trace toutes les 20 affectations
      _allocCounter++;
      if (_allocCounter % 20 === 0) {
        _dumpTopDeficits_(ctx, 'P3 @' + _allocCounter + ' placements');
      }
    }

    if (batch.length > 0) {
      writeBatchToCache_(ctx, classe, batch);
      baseMarkPlaced_(grpsIds_(batch), 'P3', classe);

      // ✅ Log détaillé de la parité finale
      const finalF = batch.filter(function(s) { return String(s.SEXE || '').toUpperCase() === 'F'; }).length;
      const finalM = batch.filter(function(s) { return String(s.SEXE || '').toUpperCase() === 'M'; }).length;
      logLine('INFO', '    ✅ ' + batch.length + ' élèves ajoutés à ' + classe + ' (' + finalF + 'F + ' + finalM + 'M)');
    }
  }

  SpreadsheetApp.flush();

  // ✅ Snapshot final après complétion
  const needsFinal = getClassNeedsFromCache_(ctx);
  _dumpClassNeeds_(needsFinal, '📊 État final');

  // Vérifier s'il reste des élèves non placés
  const remaining = baseGetFree_();
  if (remaining.length > 0) {
    logLine('WARN', '⚠️ ' + remaining.length + ' élèves restent non placés dans _BASEOPTI');
  } else {
    logLine('INFO', '✅ Tous les élèves ont été placés');
  }

  logLine('INFO', '✅ PHASE 3 terminée');

  return {
    ok: true,
    stats: {}
  };
}

/**
 * Log les besoins de toutes les classes (observabilité)
 * Format : classe current/target (need N, ΔF-M)
 */
function _dumpClassNeeds_(needs, label) {
  try {
    const arr = [];
    for (const c in needs) {
      const info = needs[c];
      arr.push({
        c: c,
        cur: info.current || 0,
        tgt: info.target || 0,
        need: info.need || 0,
        par: Math.abs(info.parityDelta || 0)
      });
    }
    // Tri par besoin décroissant
    arr.sort(function(a, b) {
      return (b.need - a.need) || (b.par - a.par) || (a.cur - b.cur);
    });

    const line = arr.map(function(x) {
      return x.c + ' ' + x.cur + '/' + x.tgt + ' (need ' + x.need + ', Δ' + x.par + ')';
    }).join(' | ');

    logLine('INFO', label + ' : ' + line);
  } catch(e) {
    logLine('WARN', '_dumpClassNeeds failed: ' + e);
  }
}

/**
 * ✅ MICRO-PATCH 2 : Dump top-3 déficits (trace P3)
 * Affiche les 3 classes avec le plus grand besoin
 * 
 * ✅ MICRO-POINT 2 : Détection de stagnation
 * Compteur global pour tracker les classes qui restent dans le top déficit
 */
var _deficitHistory_ = {}; // { "6°1": 3, "6°3": 2 } = nombre de fois dans le top

function _dumpTopDeficits_(ctx, whenLabel) {
  const needs = getClassNeedsFromCache_(ctx); // {cls:{current,target,need,...}}
  const arr = [];
  for (const cls in needs) {
    const info = needs[cls];
    arr.push({
      cls: cls,
      need: (info && info.need) || 0,
      tgt: (info && info.target) || 0,
      cur: (info && info.current) || 0
    });
  }
  arr.sort(function(a, b) { return b.need - a.need; });
  const worst = arr.slice(0, 3);
  
  const line = worst.map(function(w) {
    return w.cls + ' ' + w.cur + '/' + w.tgt + ' (need=' + w.need + ')';
  }).join(' | ');
  
  logLine('INFO', '📉 ' + whenLabel + ' – Top déficits: ' + line);
  
  // ✅ MICRO-POINT 2 : Tracker la stagnation
  const topClasses = worst.map(function(w) { return w.cls; });
  
  // Incrémenter le compteur pour les classes dans le top
  topClasses.forEach(function(cls) {
    _deficitHistory_[cls] = (_deficitHistory_[cls] || 0) + 1;
  });
  
  // Réinitialiser les classes qui ne sont plus dans le top
  for (const cls in _deficitHistory_) {
    if (topClasses.indexOf(cls) === -1) {
      _deficitHistory_[cls] = 0;
    }
  }
  
  // ✅ ALERTE si une classe stagne ≥3 dumps d'affilée (60 placements)
  for (const cls in _deficitHistory_) {
    if (_deficitHistory_[cls] >= 3) {
      const info = needs[cls];
      const need = (info && info.need) || 0;
      const cur = (info && info.current) || 0;
      const tgt = (info && info.target) || 0;
      logLine('WARN', '⚠️ STAGNATION – ' + cls + ' bloquée dans le top déficit depuis ' + (_deficitHistory_[cls] * 20) + ' placements (' + cur + '/' + tgt + ', need=' + need + '). Vérifier quotas/parité/groupes A.');
    }
  }
}

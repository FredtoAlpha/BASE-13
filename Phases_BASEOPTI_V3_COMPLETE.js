/**
 * ===================================================================
 * PHASES 1-2-3-4 V3 - _BASEOPTI COMME VIVIER UNIQUE
 * ===================================================================
 *
 * Architecture correcte :
 * - _BASEOPTI = source unique de vérité
 * - Colonne _CLASS_ASSIGNED pour marquer les affectations
 * - Toutes les phases lisent/écrivent dans _BASEOPTI
 * - CACHE rempli à la fin uniquement
 */

// ===================================================================
// PHASE 1 V3 - OPTIONS & LV2
// ===================================================================

/**
 * Phase 1 V3 : Place les élèves avec OPT/LV2 selon quotas
 * LIT : _BASEOPTI (colonne _CLASS_ASSIGNED vide)
 * ÉCRIT : _BASEOPTI (remplit _CLASS_ASSIGNED)
 */
function Phase1I_dispatchOptionsLV2_BASEOPTI_V3(ctx) {
  logLine('INFO', '='.repeat(80));
  logLine('INFO', '📌 PHASE 1 V3 - Options & LV2 (depuis _BASEOPTI)');
  logLine('INFO', '='.repeat(80));

  const ss = ctx.ss || SpreadsheetApp.getActive();
  const baseSheet = ss.getSheetByName('_BASEOPTI');

  if (!baseSheet) {
    throw new Error('_BASEOPTI introuvable');
  }

  const data = baseSheet.getDataRange().getValues();
  const headers = data[0];

  const idxLV2 = headers.indexOf('LV2');
  const idxOPT = headers.indexOf('OPT');
  const idxAssigned = headers.indexOf('_CLASS_ASSIGNED');

  if (idxAssigned === -1) {
    throw new Error('Colonne _CLASS_ASSIGNED manquante');
  }

  const stats = {};

  // Parcourir les quotas par classe
  for (const classe in (ctx.quotas || {})) {
    const quotas = ctx.quotas[classe];

    for (const optName in quotas) {
      const quota = quotas[optName];
      if (quota <= 0) continue;

      let placed = 0;

      // Parcourir _BASEOPTI
      for (let i = 1; i < data.length; i++) {
        if (placed >= quota) break;

        const row = data[i];
        const assigned = String(row[idxAssigned] || '').trim();

        if (assigned) continue; // Déjà placé

        const lv2 = String(row[idxLV2] || '').trim().toUpperCase();
        const opt = String(row[idxOPT] || '').trim().toUpperCase();

        let match = false;
        if (['ITA', 'ESP', 'ALL', 'PT'].indexOf(optName) >= 0) {
          match = (lv2 === optName);
        } else {
          match = (opt === optName);
        }

        if (match) {
          // ✅ PLACER SANS VÉRIFIER DISSO : LV2/OPT = RÈGLE ABSOLUE
          data[i][idxAssigned] = classe;
          placed++;
          stats[optName] = (stats[optName] || 0) + 1;
        }
      }

      if (placed > 0) {
        logLine('INFO', '  ✅ ' + classe + ' : ' + placed + ' × ' + optName + (placed < quota ? ' (⚠️ quota=' + quota + ')' : ''));
      }
    }
  }

  // Écrire dans _BASEOPTI
  baseSheet.getRange(1, 1, data.length, headers.length).setValues(data);
  SpreadsheetApp.flush();

  // Sync vers colonnes legacy pour compatibilité audit
  syncClassAssignedToLegacy_('P1');

  // ⚡ OPTIMISATION QUOTA : Ne pas copier vers CACHE en Phase 1 (économiser les appels API)
  // La copie se fera en Phase 4 finale
  // copyBaseoptiToCache_V3(ctx);

  // ✅ CALCUL MOBILITÉ : Déterminer FIXE/PERMUT/LIBRE après Phase 1
  if (typeof computeMobilityFlags_ === 'function') {
    computeMobilityFlags_(ctx);
  } else {
    logLine('WARN', '⚠️ computeMobilityFlags_ non disponible (vérifier que Mobility_System.gs est chargé)');
  }

  logLine('INFO', '✅ PHASE 1 V3 terminée');

  return { ok: true, counts: stats };
}

// ===================================================================
// PHASE 2 V3 - CODES ASSO/DISSO
// ===================================================================

/**
 * Phase 2 V3 : Applique codes A (regrouper) et D (séparer)
 * LIT : _BASEOPTI (TOUS les élèves, placés ou non)
 * ÉCRIT : _BASEOPTI (update _CLASS_ASSIGNED)
 */
function Phase2I_applyDissoAsso_BASEOPTI_V3(ctx) {
  logLine('INFO', '='.repeat(80));
  logLine('INFO', '📌 PHASE 2 V3 - Codes ASSO/DISSO (depuis _BASEOPTI)');
  logLine('INFO', '='.repeat(80));

  const ss = ctx.ss || SpreadsheetApp.getActive();
  const baseSheet = ss.getSheetByName('_BASEOPTI');

  const data = baseSheet.getDataRange().getValues();
  const headers = data[0];

  const idxA = headers.indexOf('ASSO');
  const idxD = headers.indexOf('DISSO');
  const idxAssigned = headers.indexOf('_CLASS_ASSIGNED');
  const idxNom = headers.indexOf('NOM');

  let assoMoved = 0;
  let dissoMoved = 0;

  // ============= CODES ASSO (A) =============

  const groupsA = {};
  for (let i = 1; i < data.length; i++) {
    const codeA = String(data[i][idxA] || '').trim().toUpperCase();
    if (codeA) {
      if (!groupsA[codeA]) groupsA[codeA] = [];
      groupsA[codeA].push(i);
    }
  }

  logLine('INFO', '🔗 Groupes ASSO : ' + Object.keys(groupsA).length);

  for (const code in groupsA) {
    const indices = groupsA[code];
    if (indices.length <= 1) {
      logLine('INFO', '  ⏭️ A=' + code + ' : 1 seul élève');
      continue;
    }

    logLine('INFO', '  🔗 A=' + code + ' : ' + indices.length + ' élèves');

    // Trouver classe majoritaire
    const classCounts = {};
    indices.forEach(function(idx) {
      const cls = String(data[idx][idxAssigned] || '').trim();
      if (cls) {
        classCounts[cls] = (classCounts[cls] || 0) + 1;
      }
    });

    let targetClass = null;
    let maxCount = 0;
    for (const cls in classCounts) {
      if (classCounts[cls] > maxCount) {
        maxCount = classCounts[cls];
        targetClass = cls;
      }
    }

    // Si aucun placé, choisir classe la moins remplie
    if (!targetClass) {
      targetClass = findLeastPopulatedClass_V3(data, headers, ctx);
    }

    logLine('INFO', '    🎯 Cible : ' + targetClass);

    // Déplacer tous vers la cible
    indices.forEach(function(idx) {
      const currentClass = String(data[idx][idxAssigned] || '').trim();
      if (currentClass !== targetClass) {
        data[idx][idxAssigned] = targetClass;
        assoMoved++;
        logLine('INFO', '      ✅ ' + data[idx][idxNom] + ' : ' + currentClass + ' → ' + targetClass);
      }
    });
  }

  // ============= CODES DISSO (D) =============

  const groupsD = {};
  for (let i = 1; i < data.length; i++) {
    const codeD = String(data[i][idxD] || '').trim().toUpperCase();
    if (codeD) {
      if (!groupsD[codeD]) groupsD[codeD] = [];
      groupsD[codeD].push(i);
      dissoMoved++; // ✅ Compter chaque élève avec un code DISSO
    }
  }

  logLine('INFO', '🚫 Groupes DISSO : ' + Object.keys(groupsD).length + ' (' + dissoMoved + ' élèves)');

  for (const code in groupsD) {
    const indices = groupsD[code];
    // ✅ CORRECTION : Ne pas skip les groupes avec 1 élève (il faut vérifier la classe)
    // if (indices.length <= 1) continue;

    logLine('INFO', '  🚫 D=' + code + ' : ' + indices.length + ' élève(s) à vérifier');

    // Vérifier si plusieurs sont dans la même classe
    const byClass = {};
    indices.forEach(function(idx) {
      const cls = String(data[idx][idxAssigned] || '').trim();
      if (cls) {
        if (!byClass[cls]) byClass[cls] = [];
        byClass[cls].push(idx);
      }
    });

    // Pour chaque classe avec >1 élève D, déplacer
    for (const cls in byClass) {
      if (byClass[cls].length > 1) {
        logLine('INFO', '    ⚠️ ' + cls + ' contient ' + byClass[cls].length + ' D=' + code);

        // Garder le premier, déplacer les autres
        for (let j = 1; j < byClass[cls].length; j++) {
          const idx = byClass[cls][j];

          // 🔒 Trouver classe sans ce code D (en vérifiant LV2/OPT)
          const targetClass = findClassWithoutCodeD_V3(data, headers, code, groupsD[code], idx, ctx);

          if (targetClass) {
            data[idx][idxAssigned] = targetClass;
            logLine('INFO', '      ✅ ' + data[idx][idxNom] + ' : ' + cls + ' → ' + targetClass + ' (séparation D=' + code + ')');
          } else {
            logLine('WARN', '      ⚠️ ' + data[idx][idxNom] + ' reste en ' + cls + ' (contrainte LV2/OPT absolue)');
          }
        }
      }
    }
  }

  // Écrire dans _BASEOPTI
  baseSheet.getRange(1, 1, data.length, headers.length).setValues(data);
  SpreadsheetApp.flush();

  // Sync vers colonnes legacy pour compatibilité audit
  syncClassAssignedToLegacy_('P2');

  // ⚡ OPTIMISATION QUOTA : Ne pas copier vers CACHE en Phase 2 (économiser les appels API)
  // La copie se fera en Phase 4 finale
  // copyBaseoptiToCache_V3(ctx);

  // ✅ CALCUL MOBILITÉ : Recalculer après Phase 2 (codes A/D peuvent changer les contraintes)
  if (typeof computeMobilityFlags_ === 'function') {
    computeMobilityFlags_(ctx);
  } else {
    logLine('WARN', '⚠️ computeMobilityFlags_ non disponible (vérifier que Mobility_System.gs est chargé)');
  }

  logLine('INFO', '✅ PHASE 2 V3 terminée : ' + assoMoved + ' ASSO, ' + dissoMoved + ' DISSO');

  return { ok: true, asso: assoMoved, disso: dissoMoved };
}

// ===================================================================
// HELPERS
// ===================================================================

function findLeastPopulatedClass_V3(data, headers, ctx) {
  const idxAssigned = headers.indexOf('_CLASS_ASSIGNED');
  const counts = {};

  (ctx.levels || []).forEach(function(cls) {
    counts[cls] = 0;
  });

  for (let i = 1; i < data.length; i++) {
    const cls = String(data[i][idxAssigned] || '').trim();
    if (cls && counts[cls] !== undefined) {
      counts[cls]++;
    }
  }

  let minClass = null;
  let minCount = Infinity;
  for (const cls in counts) {
    if (counts[cls] < minCount) {
      minCount = counts[cls];
      minClass = cls;
    }
  }

  return minClass || (ctx.levels && ctx.levels[0]) || '6°1';
}

/**
 * 🔒 SÉCURITÉ DISSO : Trouve une classe sans le code DISSO spécifié
 * Vérifie aussi les contraintes LV2/OPT (règle absolue)
 * 
 * @param {Array} data - Données _BASEOPTI
 * @param {Array} headers - En-têtes
 * @param {string} codeD - Code DISSO à éviter
 * @param {Array} indicesWithD - Indices des élèves avec ce code DISSO
 * @param {number} eleveIdx - Index de l'élève à déplacer
 * @param {Object} ctx - Contexte avec quotas
 * @returns {string|null} Classe cible ou null si impossible
 */
function findClassWithoutCodeD_V3(data, headers, codeD, indicesWithD, eleveIdx, ctx) {
  const idxAssigned = headers.indexOf('_CLASS_ASSIGNED');
  const idxLV2 = headers.indexOf('LV2');
  const idxOPT = headers.indexOf('OPT');

  // Récupérer LV2/OPT de l'élève
  const eleveLV2 = eleveIdx ? String(data[eleveIdx][idxLV2] || '').trim().toUpperCase() : '';
  const eleveOPT = eleveIdx ? String(data[eleveIdx][idxOPT] || '').trim().toUpperCase() : '';

  // Classes déjà occupées par ce code DISSO
  const classesWithD = new Set();
  indicesWithD.forEach(function(idx) {
    const cls = String(data[idx][idxAssigned] || '').trim();
    if (cls) classesWithD.add(cls);
  });

  // Collecter toutes les classes
  const allClasses = new Set();
  for (let i = 1; i < data.length; i++) {
    const cls = String(data[i][idxAssigned] || '').trim();
    if (cls) allClasses.add(cls);
  }

  // 🔒 PRIORITÉ 1 : Trouver une classe qui propose LV2/OPT de l'élève ET sans code DISSO
  if (eleveLV2 || eleveOPT) {
    for (const cls of Array.from(allClasses)) {
      if (classesWithD.has(cls)) continue; // Déjà un élève avec ce code DISSO

      // Vérifier si cette classe propose LV2/OPT de l'élève
      const quotas = (ctx && ctx.quotas && ctx.quotas[cls]) || {};
      
      let canPlace = false;
      if (eleveLV2 && ['ITA', 'ESP', 'ALL', 'PT'].indexOf(eleveLV2) >= 0) {
        // L'élève a une LV2 spécifique
        canPlace = (quotas[eleveLV2] !== undefined && quotas[eleveLV2] > 0);
      } else if (eleveOPT) {
        // L'élève a une option spécifique
        canPlace = (quotas[eleveOPT] !== undefined && quotas[eleveOPT] > 0);
      }

      if (canPlace) {
        logLine('INFO', '        ✅ Classe ' + cls + ' compatible (propose ' + (eleveLV2 || eleveOPT) + ')');
        return cls;
      }
    }

    // ⚠️ Aucune classe compatible trouvée
    logLine('WARN', '        ⚠️ Aucune classe sans D=' + codeD + ' ne propose ' + (eleveLV2 || eleveOPT));
    logLine('WARN', '        🔒 CONTRAINTE LV2/OPT ABSOLUE : élève reste dans sa classe (doublon DISSO accepté)');
    return null; // ❌ Impossible de déplacer sans violer LV2/OPT
  }

  // 🔒 PRIORITÉ 2 : Si pas de LV2/OPT spécifique, n'importe quelle classe sans code DISSO
  for (const cls of Array.from(allClasses)) {
    if (!classesWithD.has(cls)) {
      return cls;
    }
  }

  return null; // Aucune classe disponible
}

/**
 * 🔒 GARDIEN DISSO/ASSO : Vérifie si un élève peut être placé dans une classe
 * sans violer les contraintes DISSO/ASSO
 *
 * @param {number} eleveIdx - Index de l'élève dans data
 * @param {string} targetClass - Classe de destination
 * @param {Array} data - Données _BASEOPTI
 * @param {Array} headers - En-têtes
 * @param {number} excludeIdx - Index de l'élève à exclure de la vérification (pour les swaps)
 * @param {Object} ctx - Contexte avec quotas (optionnel, pour vérifier LV2/OPT)
 * @returns {Object} { ok: boolean, reason: string }
 */
function canPlaceInClass_V3(eleveIdx, targetClass, data, headers, excludeIdx, ctx) {
  // 🛡️ Validations de sécurité
  if (!data || !headers || !targetClass) {
    logLine('ERROR', 'canPlaceInClass_V3 : paramètres invalides');
    return { ok: false, reason: 'Paramètres invalides' };
  }

  if (!data[eleveIdx]) {
    logLine('ERROR', 'canPlaceInClass_V3 : élève index ' + eleveIdx + ' introuvable');
    return { ok: false, reason: 'Élève introuvable' };
  }

  const idxD = headers.indexOf('DISSO');
  const idxA = headers.indexOf('ASSO');
  const idxAssigned = headers.indexOf('_CLASS_ASSIGNED');
  const idxLV2 = headers.indexOf('LV2');
  const idxOPT = headers.indexOf('OPT');

  if (idxAssigned === -1) {
    logLine('ERROR', 'canPlaceInClass_V3 : colonne _CLASS_ASSIGNED introuvable');
    return { ok: false, reason: 'Colonne _CLASS_ASSIGNED manquante' };
  }

  const eleveD = String(data[eleveIdx][idxD] || '').trim().toUpperCase();
  const eleveA = String(data[eleveIdx][idxA] || '').trim().toUpperCase();
  const eleveLV2 = String(data[eleveIdx][idxLV2] || '').trim().toUpperCase();
  const eleveOPT = String(data[eleveIdx][idxOPT] || '').trim().toUpperCase();

  // 🔒 VÉRIFIER LV2/OPT : L'élève a une LV2 ou OPT ?
  if ((eleveLV2 || eleveOPT) && ctx && ctx.quotas) {
    const quotas = ctx.quotas[targetClass] || {};

    // Si l'élève a une LV2 spécifique (ITA, ESP, ALL, PT)
    if (eleveLV2 && ['ITA', 'ESP', 'ALL', 'PT'].indexOf(eleveLV2) >= 0) {
      // La classe cible doit proposer cette LV2
      if (quotas[eleveLV2] === undefined || quotas[eleveLV2] === 0) {
        return {
          ok: false,
          reason: 'LV2 violation : élève a ' + eleveLV2 + ' mais classe ' + targetClass + ' ne la propose pas'
        };
      }
    }

    // Si l'élève a une option spécifique (CHAV, etc.)
    if (eleveOPT) {
      // La classe cible doit proposer cette option
      if (quotas[eleveOPT] === undefined || quotas[eleveOPT] === 0) {
        return {
          ok: false,
          reason: 'OPT violation : élève a ' + eleveOPT + ' mais classe ' + targetClass + ' ne la propose pas'
        };
      }
    }
  }

  // Vérifier DISSO : L'élève a un code D ?
  if (eleveD) {
    // Vérifier si la classe cible contient déjà un élève avec ce code D
    for (let i = 1; i < data.length; i++) {
      if (!data[i]) continue; // Skip lignes vides
      if (i === eleveIdx) continue; // Skip l'élève lui-même
      if (excludeIdx !== undefined && i === excludeIdx) continue; // Skip l'élève exclu (swap)

      const cls = String(data[i][idxAssigned] || '').trim();
      if (cls !== targetClass) continue; // Pas dans la classe cible

      const otherD = String(data[i][idxD] || '').trim().toUpperCase();
      if (otherD === eleveD) {
        return {
          ok: false,
          reason: 'DISSO violation : classe ' + targetClass + ' contient déjà un élève avec code D=' + eleveD
        };
      }
    }
  }

  // Vérifier ASSO : L'élève a un code A ?
  if (eleveA) {
    // Trouver où sont les autres membres du groupe ASSO
    let groupClass = null;
    for (let i = 1; i < data.length; i++) {
      if (!data[i]) continue; // Skip lignes vides
      if (i === eleveIdx) continue;

      const otherA = String(data[i][idxA] || '').trim().toUpperCase();
      if (otherA === eleveA) {
        const cls = String(data[i][idxAssigned] || '').trim();
        if (cls) {
          if (groupClass === null) {
            groupClass = cls;
          } else if (groupClass !== cls) {
            // Groupe ASSO déjà dispersé - ne pas ajouter de contrainte
            groupClass = null;
            break;
          }
        }
      }
    }

    // Si le groupe ASSO est déjà établi dans une classe, l'élève doit y aller
    if (groupClass && groupClass !== targetClass) {
      return {
        ok: false,
        reason: 'ASSO violation : groupe A=' + eleveA + ' est dans ' + groupClass + ', pas dans ' + targetClass
      };
    }
  }

  return { ok: true, reason: '' };
}

/**
 * 🔒 GARDIEN SWAP : Vérifie si un swap entre deux élèves viole DISSO/ASSO/LV2/OPT
 *
 * @param {number} idx1 - Index élève 1
 * @param {string} cls1 - Classe actuelle élève 1
 * @param {number} idx2 - Index élève 2
 * @param {string} cls2 - Classe actuelle élève 2
 * @param {Array} data - Données _BASEOPTI
 * @param {Array} headers - En-têtes
 * @param {Object} ctx - Contexte avec quotas
 * @returns {Object} { ok: boolean, reason: string }
 */
function canSwapStudents_V3(idx1, cls1, idx2, cls2, data, headers, ctx) {
  // Vérifier si élève 1 peut aller dans cls2 (en excluant idx2 qui va partir de cls2)
  const check1 = canPlaceInClass_V3(idx1, cls2, data, headers, idx2, ctx);
  if (!check1.ok) {
    return { ok: false, reason: 'Swap impossible : élève 1 → ' + cls2 + ' : ' + check1.reason };
  }

  // Vérifier si élève 2 peut aller dans cls1 (en excluant idx1 qui va partir de cls1)
  const check2 = canPlaceInClass_V3(idx2, cls1, data, headers, idx1, ctx);
  if (!check2.ok) {
    return { ok: false, reason: 'Swap impossible : élève 2 → ' + cls1 + ' : ' + check2.reason };
  }

  return { ok: true, reason: '' };
}

/**
 * Copie _BASEOPTI vers les onglets CACHE pour affichage live
 */
function copyBaseoptiToCache_V3(ctx) {
  logLine('INFO', '📋 copyBaseoptiToCache_V3: Début copie vers CACHE...');
  
  // 🔍 AUDIT CRITIQUE : Vérifier ctx.cacheSheets
  if (!ctx || !ctx.cacheSheets) {
    logLine('ERROR', '❌ PROBLÈME CRITIQUE: ctx.cacheSheets est undefined ou null !');
    logLine('ERROR', '   ctx existe: ' + (ctx ? 'OUI' : 'NON'));
    if (ctx) {
      logLine('ERROR', '   ctx.cacheSheets: ' + (ctx.cacheSheets || 'UNDEFINED'));
      logLine('ERROR', '   Clés de ctx: ' + Object.keys(ctx).join(', '));
    }
    return;
  }
  
  logLine('INFO', '  📌 ctx.cacheSheets: [' + ctx.cacheSheets.join(', ') + ']');
  
  const ss = ctx.ss || SpreadsheetApp.getActive();
  const baseSheet = ss.getSheetByName('_BASEOPTI');

  if (!baseSheet) {
    logLine('ERROR', '❌ _BASEOPTI introuvable !');
    return;
  }

  const data = baseSheet.getDataRange().getValues();
  const headers = data[0];
  const idxAssigned = headers.indexOf('_CLASS_ASSIGNED');

  logLine('INFO', '  📊 _BASEOPTI: ' + (data.length - 1) + ' élèves, colonne _CLASS_ASSIGNED: index=' + idxAssigned);

  // Grouper par classe
  const byClass = {};
  (ctx.cacheSheets || []).forEach(function(cacheName) {
    const cls = cacheName.replace('CACHE', '').trim();
    byClass[cls] = [];
    logLine('INFO', '  📂 Initialisation classe: ' + cls + ' (onglet: ' + cacheName + ')');
  });

  // 🔍 AUDIT : Compter les élèves assignés
  let totalAssigned = 0;
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const cls = String(row[idxAssigned] || '').trim();

    if (cls) {
      totalAssigned++;
      if (byClass[cls]) {
        byClass[cls].push(row);
      } else {
        logLine('WARN', '  ⚠️ Élève assigné à classe inconnue: ' + cls + ' (ligne ' + (i+1) + ')');
      }
    }
  }

  logLine('INFO', '  📊 Élèves assignés: ' + totalAssigned + '/' + (data.length - 1));

  // 🔍 AUDIT : Afficher répartition par classe
  for (const cls in byClass) {
    logLine('INFO', '  📌 ' + cls + ': ' + byClass[cls].length + ' élèves');
  }

  // Écrire dans CACHE
  let sheetsWritten = 0;
  for (const cls in byClass) {
    const cacheName = cls + 'CACHE';
    const sh = ss.getSheetByName(cacheName);

    if (!sh) {
      logLine('WARN', '  ⚠️ Onglet CACHE introuvable: ' + cacheName);
      continue;
    }

    // Vider TOUT le contenu (y compris les en-têtes pour forcer la mise à jour)
    if (sh.getLastRow() > 0) {
      sh.clearContents();
    }

    // ✅ TOUJOURS écrire les en-têtes de _BASEOPTI (pour synchroniser les colonnes)
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);

    // Écrire élèves
    if (byClass[cls].length > 0) {
      sh.getRange(2, 1, byClass[cls].length, headers.length).setValues(byClass[cls]);
      logLine('INFO', '  ✅ ' + cacheName + ': ' + byClass[cls].length + ' élèves écrits');
      sheetsWritten++;
    } else {
      logLine('INFO', '  ℹ️ ' + cacheName + ': 0 élèves (vide)');
    }
  }

  SpreadsheetApp.flush();
  
  logLine('INFO', '✅ copyBaseoptiToCache_V3: ' + sheetsWritten + ' onglets CACHE remplis');
}

// ===================================================================
// PHASE 3 V3 - COMPLÉTER EFFECTIFS & PARITÉ
// ===================================================================

/**
 * Phase 3 V3 : Complète les effectifs et équilibre parité
 * LIT : _BASEOPTI (élèves non assignés)
 * ÉCRIT : _BASEOPTI (update _CLASS_ASSIGNED)
 */
function Phase3I_completeAndParity_BASEOPTI_V3(ctx) {
  logLine('INFO', '='.repeat(80));
  logLine('INFO', '📌 PHASE 3 V3 - Effectifs & Parité (depuis _BASEOPTI)');
  logLine('INFO', '='.repeat(80));

  const ss = ctx.ss || SpreadsheetApp.getActive();
  const baseSheet = ss.getSheetByName('_BASEOPTI');

  const data = baseSheet.getDataRange().getValues();
  const headers = data[0];

  const idxAssigned = headers.indexOf('_CLASS_ASSIGNED');
  const idxSexe = headers.indexOf('SEXE');
  const idxA = headers.indexOf('ASSO');

  // Calculer besoins par classe
  const needs = {};
  (ctx.levels || []).forEach(function(cls) {
    const target = (ctx.targets && ctx.targets[cls]) || 0;
    let current = 0;

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idxAssigned] || '').trim() === cls) {
        current++;
      }
    }

    needs[cls] = { target: target, current: current, need: target - current };
  });

  logLine('INFO', '📊 Besoins :');
  for (const cls in needs) {
    logLine('INFO', '  ' + cls + ' : ' + needs[cls].current + '/' + needs[cls].target + ' (besoin=' + needs[cls].need + ')');
  }

  // Créer pools F et M (non assignés)
  const poolF = [];
  const poolM = [];

  for (let i = 1; i < data.length; i++) {
    const assigned = String(data[i][idxAssigned] || '').trim();
    if (assigned) continue; // Déjà placé

    const sexe = String(data[i][idxSexe] || '').toUpperCase();
    if (sexe === 'F') {
      poolF.push(i);
    } else if (sexe === 'M') {
      poolM.push(i);
    }
  }

  logLine('INFO', '👥 Pool disponible : ' + poolF.length + ' F, ' + poolM.length + ' M');

  // 🎯 CALCULER LE RATIO F/M IDÉAL (basé sur les totaux réels)
  let totalF = 0, totalM = 0;
  for (let i = 1; i < data.length; i++) {
    const sexe = String(data[i][idxSexe] || '').toUpperCase();
    if (sexe === 'F') totalF++;
    else if (sexe === 'M') totalM++;
  }

  const totalEleves = totalF + totalM;
  const ratioF = totalEleves > 0 ? totalF / totalEleves : 0.5;
  const ratioM = totalEleves > 0 ? totalM / totalEleves : 0.5;

  logLine('INFO', '⚖️ Ratio F/M global : ' + (ratioF * 100).toFixed(1) + '% F / ' + (ratioM * 100).toFixed(1) + '% M');
  logLine('INFO', '   Total : ' + totalF + ' F, ' + totalM + ' M (' + totalEleves + ' élèves)');

  // Compléter chaque classe
  const classOrder = Object.keys(needs).sort(function(a, b) {
    return needs[b].need - needs[a].need;
  });

  for (let c = 0; c < classOrder.length; c++) {
    const classe = classOrder[c];
    let need = needs[classe].need;

    if (need <= 0) continue;

    logLine('INFO', '  🔄 Complétion de ' + classe + ' (' + need + ' élèves)');

    // Compter F/M actuels
    let countF = 0, countM = 0;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idxAssigned] || '').trim() === classe) {
        const sexe = String(data[i][idxSexe] || '').toUpperCase();
        if (sexe === 'F') countF++;
        else if (sexe === 'M') countM++;
      }
    }

    // 🎯 Calculer la cible F/M idéale pour cette classe
    const targetTotal = needs[classe].target;
    const targetF = Math.round(targetTotal * ratioF);
    const targetM = targetTotal - targetF;

    logLine('INFO', '    🎯 Cible parité : ' + targetF + 'F / ' + targetM + 'M (actuel : ' + countF + 'F / ' + countM + 'M)');

    // Placement selon ratio F/M idéal AVEC VALIDATION DISSO/ASSO
    let blocked = 0;
    while (need > 0 && (poolF.length > 0 || poolM.length > 0)) {
      // ✅ Décision basée sur l'écart par rapport à la cible idéale
      const ecartF = countF - targetF;
      const ecartM = countM - targetM;
      const wantF = ecartF < ecartM; // Prendre F si on est plus loin de la cible F que de la cible M

      let idx = null;
      let selectedPool = null;

      // 🔒 Chercher un élève compatible dans le pool préféré
      if (wantF && poolF.length > 0) {
        for (let i = 0; i < poolF.length; i++) {
          const check = canPlaceInClass_V3(poolF[i], classe, data, headers);
          if (check.ok) {
            idx = poolF.splice(i, 1)[0];
            selectedPool = 'F';
            break;
          }
        }
      } else if (!wantF && poolM.length > 0) {
        for (let i = 0; i < poolM.length; i++) {
          const check = canPlaceInClass_V3(poolM[i], classe, data, headers);
          if (check.ok) {
            idx = poolM.splice(i, 1)[0];
            selectedPool = 'M';
            break;
          }
        }
      }

      // 🔒 Si pas trouvé, essayer l'autre pool
      if (idx === null && poolF.length > 0) {
        for (let i = 0; i < poolF.length; i++) {
          const check = canPlaceInClass_V3(poolF[i], classe, data, headers);
          if (check.ok) {
            idx = poolF.splice(i, 1)[0];
            selectedPool = 'F';
            break;
          }
        }
      }

      if (idx === null && poolM.length > 0) {
        for (let i = 0; i < poolM.length; i++) {
          const check = canPlaceInClass_V3(poolM[i], classe, data, headers);
          if (check.ok) {
            idx = poolM.splice(i, 1)[0];
            selectedPool = 'M';
            break;
          }
        }
      }

      if (idx === null) {
        blocked++;
        logLine('WARN', '    ⚠️ Plus d\'élèves compatibles DISSO/ASSO pour ' + classe + ' (need=' + need + ')');
        break;
      }

      // ✅ Placement validé
      data[idx][idxAssigned] = classe;
      if (selectedPool === 'F') countF++;
      else if (selectedPool === 'M') countM++;
      need--;
    }

    logLine('INFO', '    ✅ ' + classe + ' complété (' + countF + 'F/' + countM + 'M)');
  }

  // Écrire dans _BASEOPTI
  baseSheet.getRange(1, 1, data.length, headers.length).setValues(data);
  SpreadsheetApp.flush();

  // Sync vers colonnes legacy pour compatibilité audit
  syncClassAssignedToLegacy_('P3');

  // ⚡ OPTIMISATION QUOTA : Ne pas copier vers CACHE en Phase 3 (économiser les appels API)
  // La copie se fera en Phase 4 finale
  // copyBaseoptiToCache_V3(ctx);

  // ✅ CALCUL MOBILITÉ : Recalculer après Phase 3 (effectifs complets)
  if (typeof computeMobilityFlags_ === 'function') {
    computeMobilityFlags_(ctx);
  } else {
    logLine('WARN', '⚠️ computeMobilityFlags_ non disponible (vérifier que Mobility_System.gs est chargé)');
  }

  // Vérifier élèves non placés
  let remaining = 0;
  for (let i = 1; i < data.length; i++) {
    if (!String(data[i][idxAssigned] || '').trim()) {
      remaining++;
    }
  }

  if (remaining > 0) {
    logLine('WARN', '⚠️ ' + remaining + ' élèves non placés après P3');
  }

  logLine('INFO', '✅ PHASE 3 V3 terminée');

  return { ok: true };
}

// ===================================================================
// PHASE 4 V3 - SWAPS BASÉS SUR SCORES
// ===================================================================

/**
 * Phase 4 V3 : Optimise les scores par swaps
 * LIT : _BASEOPTI
 * PRIORITÉ : COM=1 > COM=2 > TRA > PART > ABS
 * RÉCUPÈRE : Poids depuis l'UI via ctx.weights
 */
function Phase4_balanceScoresSwaps_BASEOPTI_V3(ctx) {
  logLine('INFO', '='.repeat(80));
  logLine('INFO', '📌 PHASE 4 V3 - Swaps scores (depuis _BASEOPTI)');
  logLine('INFO', '='.repeat(80));

  // Récupérer poids (depuis UI ou défaut)
  const weights = ctx.weights || {
    com: 1.0,  // Priorité MAXIMALE
    tra: 0.7,
    part: 0.4,
    abs: 0.2
  };

  logLine('INFO', '⚖️ Poids : COM=' + weights.com + ', TRA=' + weights.tra + ', PART=' + weights.part + ', ABS=' + weights.abs);

  const ss = ctx.ss || SpreadsheetApp.getActive();
  const baseSheet = ss.getSheetByName('_BASEOPTI');

  const data = baseSheet.getDataRange().getValues();
  const headers = data[0];

  const idxAssigned = headers.indexOf('_CLASS_ASSIGNED');
  const idxCOM = headers.indexOf('COM');
  const idxTRA = headers.indexOf('TRA');
  const idxPART = headers.indexOf('PART');
  const idxABS = headers.indexOf('ABS');
  const idxSexe = headers.indexOf('SEXE');
  const idxMobilite = headers.indexOf('MOBILITE');
  const idxFixe = headers.indexOf('FIXE');
  const idxNom = headers.indexOf('NOM');

  // Grouper par classe
  const byClass = {};
  for (let i = 1; i < data.length; i++) {
    const cls = String(data[i][idxAssigned] || '').trim();
    if (cls) {
      if (!byClass[cls]) byClass[cls] = [];
      byClass[cls].push(i);
    }
  }

  logLine('INFO', '📖 Élèves par classe :');
  for (const cls in byClass) {
    logLine('INFO', '  ' + cls + ' : ' + byClass[cls].length + ' élèves');
  }

  // Calculer variance initiale des distributions
  const initialDist = calculateScoreDistributions_V3(data, headers, byClass);
  const initialVariance = calculateDistributionVariance_V3(initialDist, weights);
  logLine('INFO', '📊 Variance initiale : ' + initialVariance.toFixed(2) + ' (objectif : minimiser)');

  // Optimisation par swaps
  let swapsApplied = 0;
  const maxSwaps = ctx.maxSwaps || 100;
  const maxIterations = maxSwaps * 10;

  let bestVariance = initialVariance;
  let stagnation = 0;

  for (let iter = 0; iter < maxIterations && swapsApplied < maxSwaps; iter++) {
    // Trouver meilleur swap
    const swap = findBestSwap_V3(data, headers, byClass, weights, ctx);

    if (!swap) {
      logLine('INFO', '  🛑 Plus de swap bénéfique (iteration=' + iter + ')');
      break;
    }

    // Appliquer le swap
    const idx1 = swap.idx1;
    const idx2 = swap.idx2;
    const cls1 = String(data[idx1][idxAssigned]);
    const cls2 = String(data[idx2][idxAssigned]);

    data[idx1][idxAssigned] = cls2;
    data[idx2][idxAssigned] = cls1;

    // Update byClass
    const pos1 = byClass[cls1].indexOf(idx1);
    const pos2 = byClass[cls2].indexOf(idx2);
    if (pos1 >= 0) byClass[cls1][pos1] = idx2;
    if (pos2 >= 0) byClass[cls2][pos2] = idx1;

    swapsApplied++;

    if (swapsApplied % 10 === 0) {
      const newDist = calculateScoreDistributions_V3(data, headers, byClass);
      const newVariance = calculateDistributionVariance_V3(newDist, weights);
      const improvement = initialVariance - newVariance; // Positif = amélioration
      logLine('INFO', '  📊 ' + swapsApplied + ' swaps | variance=' + newVariance.toFixed(2) + ' | amélioration=' + improvement.toFixed(2));

      if (newVariance >= bestVariance) {
        stagnation++;
      } else {
        bestVariance = newVariance;
        stagnation = 0;
      }

      if (stagnation >= 5) {
        logLine('INFO', '  ⏸️ Stagnation détectée');
        break;
      }
    }
  }

  // Écrire dans _BASEOPTI
  baseSheet.getRange(1, 1, data.length, headers.length).setValues(data);
  SpreadsheetApp.flush();

  // Copier vers CACHE
  copyBaseoptiToCache_V3(ctx);

  // ✅ CORRECTION CRITIQUE : Recalculer la mobilité APRÈS la copie vers CACHE
  // Car copyBaseoptiToCache_V3 efface les colonnes FIXE/MOBILITE (elles sont vides dans _BASEOPTI)
  if (typeof computeMobilityFlags_ === 'function') {
    logLine('INFO', '🔒 Recalcul des statuts de mobilité après copie CACHE...');
    computeMobilityFlags_(ctx);
    logLine('INFO', '✅ Colonnes FIXE et MOBILITE restaurées dans les onglets CACHE');
  } else {
    logLine('WARN', '⚠️ computeMobilityFlags_ non disponible (vérifier que Mobility_System.gs est chargé)');
  }

  const finalDist = calculateScoreDistributions_V3(data, headers, byClass);
  const finalVariance = calculateDistributionVariance_V3(finalDist, weights);
  const totalImprovement = initialVariance - finalVariance;
  logLine('INFO', '✅ PHASE 4 V3 terminée : ' + swapsApplied + ' swaps, variance=' + finalVariance.toFixed(2) + ' (amélioration=' + totalImprovement.toFixed(2) + ')');

  // ✅ AUDIT COMPLET : Générer un rapport détaillé de fin d'optimisation
  const auditReport = generateOptimizationAudit_V3(ctx, data, headers, byClass, finalDist, {
    initialVariance: initialVariance,
    finalVariance: finalVariance,
    totalImprovement: totalImprovement,
    swapsApplied: swapsApplied
  });

  // Log des distributions finales
  logLine('INFO', '📊 Distributions finales COM score 1 :');
  for (const cls in finalDist) {
    logLine('INFO', '  ' + cls + ' : ' + finalDist[cls].COM[1] + ' élèves COM=1');
  }

  return { 
    ok: true, 
    swapsApplied: swapsApplied, 
    swaps: swapsApplied,
    audit: auditReport 
  };
}

/**
 * Calcule les distributions de scores pour chaque classe
 * Retourne : { classe: { COM: {1: count, 2: count, ...}, TRA: {...}, ... } }
 */
function calculateScoreDistributions_V3(data, headers, byClass) {
  const idxCOM = headers.indexOf('COM');
  const idxTRA = headers.indexOf('TRA');
  const idxPART = headers.indexOf('PART');
  const idxABS = headers.indexOf('ABS');

  const distributions = {};

  for (const cls in byClass) {
    const indices = byClass[cls];

    // Initialiser les compteurs pour chaque score (1-4)
    distributions[cls] = {
      COM: { 1: 0, 2: 0, 3: 0, 4: 0 },
      TRA: { 1: 0, 2: 0, 3: 0, 4: 0 },
      PART: { 1: 0, 2: 0, 3: 0, 4: 0 },
      ABS: { 1: 0, 2: 0, 3: 0, 4: 0 }
    };

    // Compter les scores
    indices.forEach(function(idx) {
      const com = Number(data[idx][idxCOM] || 3);
      const tra = Number(data[idx][idxTRA] || 3);
      const part = Number(data[idx][idxPART] || 3);
      const abs = Number(data[idx][idxABS] || 3);

      distributions[cls].COM[com] = (distributions[cls].COM[com] || 0) + 1;
      distributions[cls].TRA[tra] = (distributions[cls].TRA[tra] || 0) + 1;
      distributions[cls].PART[part] = (distributions[cls].PART[part] || 0) + 1;
      distributions[cls].ABS[abs] = (distributions[cls].ABS[abs] || 0) + 1;
    });
  }

  return distributions;
}

/**
 * Calcule la variance des distributions entre classes
 * Plus la variance est basse, plus l'équilibre est bon
 */
function calculateDistributionVariance_V3(distributions, weights) {
  const criteria = ['COM', 'TRA', 'PART', 'ABS'];
  const scores = [1, 2, 3, 4];

  let totalVariance = 0;

  criteria.forEach(function(criterion) {
    const weight = weights[criterion.toLowerCase()] || 1.0;

    scores.forEach(function(score) {
      // Collecter les effectifs pour ce score dans toutes les classes
      const counts = [];
      for (const cls in distributions) {
        counts.push(distributions[cls][criterion][score] || 0);
      }

      // Calculer la variance
      const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
      const variance = counts.reduce((sum, count) => sum + Math.pow(count - mean, 2), 0) / counts.length;

      // Ajouter à la variance totale pondérée
      // Pour COM et score 1, appliquer un poids encore plus fort
      const bonus = (criterion === 'COM' && score === 1) ? 2.0 : 1.0;
      totalVariance += variance * weight * bonus;
    });
  });

  return totalVariance;
}

/**
 * Calcule le score de parité global (somme des |F-M| pour toutes les classes)
 * Plus le score est bas, meilleure est la parité
 */
function calculateParityScore_V3(data, headers, byClass) {
  const idxSexe = headers.indexOf('SEXE');
  let totalParityGap = 0;

  for (const cls in byClass) {
    let countF = 0;
    let countM = 0;

    byClass[cls].forEach(function(idx) {
      const sexe = String(data[idx][idxSexe] || '').toUpperCase();
      if (sexe === 'F') countF++;
      else if (sexe === 'M') countM++;
    });

    totalParityGap += Math.abs(countF - countM);
  }

  return totalParityGap;
}

/**
 * Trouve le meilleur swap possible
 * Critère principal : variance des scores
 * Critère de départage : parité (si amélioration variance similaire)
 */
function findBestSwap_V3(data, headers, byClass, weights, ctx) {
  const idxMobilite = headers.indexOf('MOBILITE');
  const idxFixe = headers.indexOf('FIXE');

  let bestSwap = null;
  let bestImprovement = 0.001; // Seuil minimum de réduction de variance
  let bestParityGain = 0; // Gain de parité du meilleur swap

  const currentDist = calculateScoreDistributions_V3(data, headers, byClass);
  const currentVariance = calculateDistributionVariance_V3(currentDist, weights);
  const currentParityScore = calculateParityScore_V3(data, headers, byClass);

  // 📊 Compteurs de debug
  let tested = 0;
  let blockedByMobility = 0;
  let blockedByDissoAsso = 0;
  let noImprovement = 0;

  const classes = Object.keys(byClass);

  // Essayer swaps entre paires de classes
  for (let i = 0; i < classes.length; i++) {
    for (let j = i + 1; j < classes.length; j++) {
      const cls1 = classes[i];
      const cls2 = classes[j];

      const indices1 = byClass[cls1];
      const indices2 = byClass[cls2];

      // Limiter recherche
      const max = 15;
      for (let s1 = 0; s1 < Math.min(indices1.length, max); s1++) {
        const idx1 = indices1[s1];

        // Vérifier mobilité
        const mob1 = String(data[idx1][idxMobilite] || '').toUpperCase();
        const fixe1 = String(data[idx1][idxFixe] || '').toUpperCase();
        if (mob1 === 'FIXE' || fixe1 === 'FIXE') {
          blockedByMobility++;
          continue;
        }

        for (let s2 = 0; s2 < Math.min(indices2.length, max); s2++) {
          const idx2 = indices2[s2];

          const mob2 = String(data[idx2][idxMobilite] || '').toUpperCase();
          const fixe2 = String(data[idx2][idxFixe] || '').toUpperCase();
          if (mob2 === 'FIXE' || fixe2 === 'FIXE') {
            blockedByMobility++;
            continue;
          }

          tested++;

          // 🔒 VÉRIFIER CONTRAINTES DISSO/ASSO/LV2/OPT avant le swap
          const swapCheck = canSwapStudents_V3(idx1, cls1, idx2, cls2, data, headers, ctx);
          if (!swapCheck.ok) {
            blockedByDissoAsso++;
            continue; // Skip ce swap s'il viole DISSO/ASSO/LV2/OPT
          }

          // Simuler le swap
          const saved1 = data[idx1][headers.indexOf('_CLASS_ASSIGNED')];
          const saved2 = data[idx2][headers.indexOf('_CLASS_ASSIGNED')];

          data[idx1][headers.indexOf('_CLASS_ASSIGNED')] = cls2;
          data[idx2][headers.indexOf('_CLASS_ASSIGNED')] = cls1;

          // Update temporaire byClass
          byClass[cls1][s1] = idx2;
          byClass[cls2][s2] = idx1;

          // Calculer nouvelle variance
          const newDist = calculateScoreDistributions_V3(data, headers, byClass);
          const newVariance = calculateDistributionVariance_V3(newDist, weights);
          const improvement = currentVariance - newVariance; // Positif = réduction de variance = bon

          // Calculer impact sur la parité (critère de départage)
          const newParityScore = calculateParityScore_V3(data, headers, byClass);
          const parityGain = currentParityScore - newParityScore; // Positif = amélioration parité

          // Restaurer
          data[idx1][headers.indexOf('_CLASS_ASSIGNED')] = saved1;
          data[idx2][headers.indexOf('_CLASS_ASSIGNED')] = saved2;
          byClass[cls1][s1] = idx1;
          byClass[cls2][s2] = idx2;

          // Décider si ce swap est meilleur
          let takeThisSwap = false;

          if (improvement > bestImprovement * 1.02) {
            // Amélioration variance significativement meilleure (> 2%)
            takeThisSwap = true;
          } else if (improvement >= bestImprovement * 0.98 && improvement > 0.001) {
            // Amélioration variance similaire (écart < 2%), utiliser parité comme départage
            if (parityGain > bestParityGain) {
              takeThisSwap = true;
            }
          }

          if (takeThisSwap) {
            bestImprovement = improvement;
            bestParityGain = parityGain;
            bestSwap = { idx1: idx1, idx2: idx2, improvement: improvement, parityGain: parityGain };
          } else {
            noImprovement++;
          }
        }
      }
    }
  }

  // 📊 Log des statistiques de recherche
  if (tested > 0 || blockedByMobility > 0 || blockedByDissoAsso > 0) {
    logLine('INFO', '  🔍 Recherche swap : ' + tested + ' testés, ' + blockedByMobility + ' bloqués (mobilité), ' +
            blockedByDissoAsso + ' bloqués (DISSO/ASSO), ' + noImprovement + ' sans amélioration');
  }

  return bestSwap;
}

// ===================================================================
// SYNC LEGACY COLUMNS FOR AUDIT COMPATIBILITY
// ===================================================================

/**
 * Synchronise _CLASS_ASSIGNED vers les colonnes legacy (_PLACED, CLASSE_FINAL, _TARGET_CLASS)
 * pour assurer la compatibilité avec les fonctions d'audit existantes.
 *
 * @param {string} phaseLabel - Label de la phase (P1, P2, P3, P4)
 */
function syncClassAssignedToLegacy_(phaseLabel) {
  const ss = SpreadsheetApp.getActive();
  const baseSheet = ss.getSheetByName('_BASEOPTI');

  if (!baseSheet) {
    logLine('WARN', '⚠️ syncClassAssignedToLegacy_: _BASEOPTI introuvable');
    return;
  }

  const data = baseSheet.getDataRange().getValues();
  const headers = data[0];

  const idxAssigned = headers.indexOf('_CLASS_ASSIGNED');
  const idxPlaced = headers.indexOf('_PLACED');
  const idxClasseFinal = headers.indexOf('CLASSE_FINAL');
  const idxTargetClass = headers.indexOf('_TARGET_CLASS');

  if (idxAssigned === -1) {
    logLine('WARN', '⚠️ syncClassAssignedToLegacy_: colonne _CLASS_ASSIGNED introuvable');
    return;
  }

  let synced = 0;

  for (let i = 1; i < data.length; i++) {
    const assigned = String(data[i][idxAssigned] || '').trim();

    if (assigned) {
      // Sync _PLACED
      if (idxPlaced >= 0) {
        data[i][idxPlaced] = phaseLabel;
      }

      // Sync CLASSE_FINAL
      if (idxClasseFinal >= 0) {
        data[i][idxClasseFinal] = assigned;
      }

      // Sync _TARGET_CLASS
      if (idxTargetClass >= 0) {
        data[i][idxTargetClass] = assigned;
      }

      synced++;
    }
  }

  // Écrire les modifications
  baseSheet.getRange(1, 1, data.length, headers.length).setValues(data);
  SpreadsheetApp.flush();

  logLine('INFO', '  🔄 Sync legacy: ' + synced + ' élèves (' + phaseLabel + ')');
}

/**
 * ============================================================
 * AUDIT COMPLET DE FIN D'OPTIMISATION
 * ============================================================
 * Génère un rapport détaillé avec :
 * - Répartition par classe (effectifs, parité F/M)
 * - Distribution des scores (COM, TRA, PART, ABS)
 * - Respect des quotas LV2/OPT
 * - Statuts de mobilité (FIXE, PERMUT, LIBRE)
 * - Codes ASSO/DISSO
 * - Métriques de qualité (variance, écart-type)
 *
 * @param {Object} ctx - Contexte d'optimisation
 * @param {Array} data - Données _BASEOPTI
 * @param {Array} headers - En-têtes _BASEOPTI
 * @param {Object} byClass - Index des élèves par classe
 * @param {Object} distributions - Distributions des scores
 * @param {Object} metrics - Métriques d'optimisation
 * @returns {Object} Rapport d'audit complet
 */
function generateOptimizationAudit_V3(ctx, data, headers, byClass, distributions, metrics) {
  logLine('INFO', '');
  logLine('INFO', '═══════════════════════════════════════════════════════');
  logLine('INFO', '📊 AUDIT COMPLET DE FIN D\'OPTIMISATION');
  logLine('INFO', '═══════════════════════════════════════════════════════');
  logLine('INFO', '');

  const report = {
    timestamp: new Date().toISOString(),
    metrics: metrics,
    classes: {},
    global: {
      totalStudents: 0,
      totalFemale: 0,
      totalMale: 0,
      parityRatio: 0
    },
    quotas: {},
    mobility: {
      FIXE: 0,
      PERMUT: 0,
      LIBRE: 0,
      CONFLIT: 0
    },
    codes: {
      ASSO: {},
      DISSO: {}
    },
    quality: {}
  };

  // Indices des colonnes
  const idxNom = headers.indexOf('NOM');
  const idxPrenom = headers.indexOf('PRENOM');
  const idxSexe = headers.indexOf('SEXE');
  const idxLV2 = headers.indexOf('LV2');
  const idxOPT = headers.indexOf('OPT');
  const idxCOM = headers.indexOf('COM');
  const idxTRA = headers.indexOf('TRA');
  const idxPART = headers.indexOf('PART');
  const idxABS = headers.indexOf('ABS');
  const idxMobilite = headers.indexOf('MOBILITE');
  const idxFixe = headers.indexOf('FIXE');
  const idxAsso = headers.indexOf('ASSO');
  const idxDisso = headers.indexOf('DISSO');
  const idxClassAssigned = headers.indexOf('_CLASS_ASSIGNED');

  // ========== 1. ANALYSE PAR CLASSE ==========
  logLine('INFO', '📋 1. RÉPARTITION PAR CLASSE');
  logLine('INFO', '─────────────────────────────────────────────────────');

  for (const cls in byClass) {
    const indices = byClass[cls];
    const classData = {
      name: cls,
      total: indices.length,
      female: 0,
      male: 0,
      parityRatio: 0,
      scores: {
        COM: { 1: 0, 2: 0, 3: 0, 4: 0, avg: 0 },
        TRA: { 1: 0, 2: 0, 3: 0, 4: 0, avg: 0 },
        PART: { 1: 0, 2: 0, 3: 0, 4: 0, avg: 0 },
        ABS: { 1: 0, 2: 0, 3: 0, 4: 0, avg: 0 }
      },
      lv2: {},
      opt: {},
      mobility: { FIXE: 0, PERMUT: 0, LIBRE: 0, CONFLIT: 0 }
    };

    // Compter par sexe, scores, LV2, OPT, mobilité
    indices.forEach(function(idx) {
      const sexe = String(data[idx][idxSexe] || '').toUpperCase();
      if (sexe === 'F') classData.female++;
      else if (sexe === 'M') classData.male++;

      // Scores
      const com = Number(data[idx][idxCOM] || 3);
      const tra = Number(data[idx][idxTRA] || 3);
      const part = Number(data[idx][idxPART] || 3);
      const abs = Number(data[idx][idxABS] || 3);

      classData.scores.COM[com]++;
      classData.scores.TRA[tra]++;
      classData.scores.PART[part]++;
      classData.scores.ABS[abs]++;

      // LV2 et OPT
      const lv2 = String(data[idx][idxLV2] || '').trim().toUpperCase();
      const opt = String(data[idx][idxOPT] || '').trim().toUpperCase();

      if (lv2 && lv2 !== 'ESP' && lv2 !== 'ANG') {
        classData.lv2[lv2] = (classData.lv2[lv2] || 0) + 1;
      }
      if (opt) {
        classData.opt[opt] = (classData.opt[opt] || 0) + 1;
      }

      // Mobilité
      const mob = String(data[idx][idxMobilite] || 'LIBRE').toUpperCase();
      if (mob.includes('FIXE')) classData.mobility.FIXE++;
      else if (mob.includes('PERMUT')) classData.mobility.PERMUT++;
      else if (mob.includes('CONFLIT')) classData.mobility.CONFLIT++;
      else classData.mobility.LIBRE++;
    });

    // Calculer parité
    classData.parityRatio = classData.total > 0 
      ? (classData.female / classData.total * 100).toFixed(1) 
      : 0;

    // Calculer moyennes des scores
    ['COM', 'TRA', 'PART', 'ABS'].forEach(function(scoreType) {
      let sum = 0;
      let count = 0;
      for (let score = 1; score <= 4; score++) {
        sum += score * classData.scores[scoreType][score];
        count += classData.scores[scoreType][score];
      }
      classData.scores[scoreType].avg = count > 0 ? (sum / count).toFixed(2) : 0;
    });

    report.classes[cls] = classData;
    report.global.totalStudents += classData.total;
    report.global.totalFemale += classData.female;
    report.global.totalMale += classData.male;

    // Log
    logLine('INFO', '  ' + cls + ' : ' + classData.total + ' élèves (' + classData.female + 'F / ' + classData.male + 'M = ' + classData.parityRatio + '% F)');
    logLine('INFO', '    Scores moyens: COM=' + classData.scores.COM.avg + ', TRA=' + classData.scores.TRA.avg + ', PART=' + classData.scores.PART.avg + ', ABS=' + classData.scores.ABS.avg);
    
    if (Object.keys(classData.lv2).length > 0) {
      logLine('INFO', '    LV2: ' + JSON.stringify(classData.lv2));
    }
    if (Object.keys(classData.opt).length > 0) {
      logLine('INFO', '    OPT: ' + JSON.stringify(classData.opt));
    }
    
    logLine('INFO', '    Mobilité: FIXE=' + classData.mobility.FIXE + ', PERMUT=' + classData.mobility.PERMUT + ', LIBRE=' + classData.mobility.LIBRE);
  }

  // Parité globale
  report.global.parityRatio = report.global.totalStudents > 0
    ? (report.global.totalFemale / report.global.totalStudents * 100).toFixed(1)
    : 0;

  logLine('INFO', '');
  logLine('INFO', '  GLOBAL : ' + report.global.totalStudents + ' élèves (' + report.global.totalFemale + 'F / ' + report.global.totalMale + 'M = ' + report.global.parityRatio + '% F)');

  // ========== 2. RESPECT DES QUOTAS ==========
  logLine('INFO', '');
  logLine('INFO', '📊 2. RESPECT DES QUOTAS LV2/OPT');
  logLine('INFO', '─────────────────────────────────────────────────────');

  if (ctx.quotas) {
    for (const cls in ctx.quotas) {
      const quotasDef = ctx.quotas[cls];
      const classData = report.classes[cls];
      
      if (!classData) continue;

      logLine('INFO', '  ' + cls + ' :');

      for (const option in quotasDef) {
        const quota = quotasDef[option];
        const actual = classData.lv2[option.toUpperCase()] || classData.opt[option.toUpperCase()] || 0;
        const status = actual <= quota ? '✅' : '⚠️';
        
        logLine('INFO', '    ' + status + ' ' + option + ' : ' + actual + ' / ' + quota + ' (quota)');
        
        if (!report.quotas[option]) {
          report.quotas[option] = { quota: quota, actual: 0, classes: [] };
        }
        report.quotas[option].actual += actual;
        report.quotas[option].classes.push({ class: cls, count: actual });
      }
    }
  }

  // ========== 3. CODES ASSO/DISSO ==========
  logLine('INFO', '');
  logLine('INFO', '🔗 3. CODES ASSO/DISSO');
  logLine('INFO', '─────────────────────────────────────────────────────');

  for (let i = 1; i < data.length; i++) {
    const asso = String(data[i][idxAsso] || '').trim().toUpperCase();
    const disso = String(data[i][idxDisso] || '').trim().toUpperCase();
    const classe = String(data[i][idxClassAssigned] || '').trim();

    if (asso) {
      if (!report.codes.ASSO[asso]) {
        report.codes.ASSO[asso] = { count: 0, classes: {} };
      }
      report.codes.ASSO[asso].count++;
      report.codes.ASSO[asso].classes[classe] = (report.codes.ASSO[asso].classes[classe] || 0) + 1;
    }

    if (disso) {
      if (!report.codes.DISSO[disso]) {
        report.codes.DISSO[disso] = { count: 0, classes: {} };
      }
      report.codes.DISSO[disso].count++;
      report.codes.DISSO[disso].classes[classe] = (report.codes.DISSO[disso].classes[classe] || 0) + 1;
    }
  }

  // Log ASSO
  const assoKeys = Object.keys(report.codes.ASSO);
  if (assoKeys.length > 0) {
    logLine('INFO', '  ASSO (' + assoKeys.length + ' groupes) :');
    assoKeys.forEach(function(code) {
      const group = report.codes.ASSO[code];
      const classesStr = Object.keys(group.classes).map(function(c) {
        return c + '(' + group.classes[c] + ')';
      }).join(', ');
      const status = Object.keys(group.classes).length === 1 ? '✅' : '⚠️';
      logLine('INFO', '    ' + status + ' ' + code + ' : ' + group.count + ' élèves → ' + classesStr);
    });
  } else {
    logLine('INFO', '  Aucun code ASSO');
  }

  // Log DISSO
  const dissoKeys = Object.keys(report.codes.DISSO);
  if (dissoKeys.length > 0) {
    logLine('INFO', '  DISSO (' + dissoKeys.length + ' codes) :');
    dissoKeys.forEach(function(code) {
      const group = report.codes.DISSO[code];
      const classesStr = Object.keys(group.classes).map(function(c) {
        return c + '(' + group.classes[c] + ')';
      }).join(', ');
      const status = Object.keys(group.classes).length === group.count ? '✅' : '⚠️';
      logLine('INFO', '    ' + status + ' ' + code + ' : ' + group.count + ' élèves → ' + classesStr);
    });
  } else {
    logLine('INFO', '  Aucun code DISSO');
  }

  // ========== 4. MÉTRIQUES DE QUALITÉ ==========
  logLine('INFO', '');
  logLine('INFO', '📈 4. MÉTRIQUES DE QUALITÉ');
  logLine('INFO', '─────────────────────────────────────────────────────');

  // Calculer écart-type des effectifs
  const effectifs = Object.keys(report.classes).map(function(cls) {
    return report.classes[cls].total;
  });
  const avgEffectif = effectifs.reduce(function(a, b) { return a + b; }, 0) / effectifs.length;
  const varianceEffectif = effectifs.reduce(function(sum, val) {
    return sum + Math.pow(val - avgEffectif, 2);
  }, 0) / effectifs.length;
  const ecartTypeEffectif = Math.sqrt(varianceEffectif);

  report.quality.effectifs = {
    avg: avgEffectif.toFixed(2),
    ecartType: ecartTypeEffectif.toFixed(2)
  };

  logLine('INFO', '  Effectifs : moyenne=' + report.quality.effectifs.avg + ', écart-type=' + report.quality.effectifs.ecartType);

  // Calculer écart-type de la parité
  const parities = Object.keys(report.classes).map(function(cls) {
    return parseFloat(report.classes[cls].parityRatio);
  });
  const avgParity = parities.reduce(function(a, b) { return a + b; }, 0) / parities.length;
  const varianceParity = parities.reduce(function(sum, val) {
    return sum + Math.pow(val - avgParity, 2);
  }, 0) / parities.length;
  const ecartTypeParity = Math.sqrt(varianceParity);

  report.quality.parity = {
    avg: avgParity.toFixed(1),
    ecartType: ecartTypeParity.toFixed(2)
  };

  logLine('INFO', '  Parité F/M : moyenne=' + report.quality.parity.avg + '% F, écart-type=' + report.quality.parity.ecartType);

  // Métriques d'optimisation
  logLine('INFO', '  Variance scores : initiale=' + metrics.initialVariance.toFixed(2) + ', finale=' + metrics.finalVariance.toFixed(2));
  logLine('INFO', '  Amélioration : ' + metrics.totalImprovement.toFixed(2) + ' (' + (metrics.totalImprovement / metrics.initialVariance * 100).toFixed(1) + '%)');
  logLine('INFO', '  Swaps appliqués : ' + metrics.swapsApplied);

  // ========== 5. SYNTHÈSE ==========
  logLine('INFO', '');
  logLine('INFO', '✅ 5. SYNTHÈSE');
  logLine('INFO', '─────────────────────────────────────────────────────');
  logLine('INFO', '  Classes : ' + Object.keys(report.classes).length);
  logLine('INFO', '  Élèves : ' + report.global.totalStudents + ' (' + report.global.totalFemale + 'F / ' + report.global.totalMale + 'M)');
  logLine('INFO', '  Parité globale : ' + report.global.parityRatio + '% F');
  logLine('INFO', '  Groupes ASSO : ' + assoKeys.length);
  logLine('INFO', '  Codes DISSO : ' + dissoKeys.length);
  logLine('INFO', '  Amélioration variance : ' + (metrics.totalImprovement / metrics.initialVariance * 100).toFixed(1) + '%');

  logLine('INFO', '');
  logLine('INFO', '═══════════════════════════════════════════════════════');
  logLine('INFO', '');

  return report;
}


/**
 * ===================================================================
 * PHASE 2I : APPLICATION CODES DISSO/ASSO
 * ===================================================================
 */

/**
 * Phase 2I : Applique les codes DISSO et ASSO
 * LIT : depuis CACHE (résultats Phase 1I)
 * ÉCRIT : uniquement CACHE
 */
function Phase2I_applyDissoAsso_(ctx) {
  const warnings = [];

  // Lire depuis CACHE (résultats Phase 1I)
  const classesState = readElevesFromCache_(ctx);

  // Verrouiller les attributs Options/LV2 placés en Phase 1I
  lockAttributes_(classesState, { options: true, lv2: true });

  // Appliquer DISSO (séparer codes D entre classes)
  const movedD = applyDisso_(classesState, ctx);

  // Appliquer ASSO (regrouper codes A)
  const movedA = applyAsso_(classesState, ctx);

  // Écrire dans CACHE
  writeAllClassesToCACHE_(ctx, classesState);

  return {
    ok: true,
    warnings,
    counts: { disso: movedD, asso: movedA }
  };
}

/**
 * Verrouille certains attributs pour éviter qu'ils soient modifiés
 */
function lockAttributes_(classesState, locks) {
  for (const [niveau, eleves] of Object.entries(classesState)) {
    for (const eleve of eleves) {
      if (!eleve._locks) {
        eleve._locks = {};
      }

      if (locks.options) {
        eleve._locks.ITA = true;
        eleve._locks.CHAV = true;
      }
      if (locks.lv2) {
        eleve._locks.LV2 = true;
      }
      if (locks.disso) {
        eleve._locks.DISSO = true;
      }
      if (locks.asso) {
        eleve._locks.ASSO = true;
      }
      if (locks.parity) {
        eleve._locks.PARITY = true;
      }
    }
  }
}

/**
 * Applique les codes DISSO
 * Sépare les élèves avec même code D dans des classes différentes
 */
function applyDisso_(classesState, ctx) {
  let movedCount = 0;

  // Collecter tous les codes DISSO
  const dissoGroups = {};

  for (const [niveau, eleves] of Object.entries(classesState)) {
    for (const eleve of eleves) {
      const codeD = eleve.DISSO || eleve.D || eleve['Code D'] || '';
      if (codeD && codeD !== '') {
        if (!dissoGroups[codeD]) {
          dissoGroups[codeD] = [];
        }
        dissoGroups[codeD].push({ eleve: eleve, classe: niveau });
      }
    }
  }

  // Pour chaque code DISSO, vérifier si plusieurs élèves sont dans la même classe
  for (const [codeD, membres] of Object.entries(dissoGroups)) {
    if (membres.length < 2) continue;

    // Regrouper par classe
    const parClasse = {};
    for (const m of membres) {
      if (!parClasse[m.classe]) {
        parClasse[m.classe] = [];
      }
      parClasse[m.classe].push(m.eleve);
    }

    // Si une classe contient plusieurs élèves avec ce code D, déplacer
    for (const [classe, elevesEnDouble] of Object.entries(parClasse)) {
      if (elevesEnDouble.length > 1) {
        // Déplacer tous sauf le premier
        for (let i = 1; i < elevesEnDouble.length; i++) {
          const eleveADeplacer = elevesEnDouble[i];

          // Trouver une classe cible qui n'a pas ce code D
          const classeTarget = findClasseWithoutCode_(classesState, codeD, classe);

          if (classeTarget) {
            // Déplacer l'élève
            moveEleveToClass_(classesState, eleveADeplacer, classe, classeTarget);
            movedCount = movedCount + 1;
            logLine('INFO', '  DISSO : Déplacé élève code D=' + codeD + ' de ' + classe + ' vers ' + classeTarget);
          }
        }
      }
    }
  }

  return movedCount;
}

/**
 * Applique les codes ASSO
 * Regroupe les élèves avec même code A dans la même classe
 */
function applyAsso_(classesState, ctx) {
  let movedCount = 0;

  // Collecter tous les codes ASSO
  const assoGroups = {};

  for (const [niveau, eleves] of Object.entries(classesState)) {
    for (const eleve of eleves) {
      const codeA = eleve.ASSO || eleve.A || eleve['Code A'] || '';
      if (codeA && codeA !== '') {
        if (!assoGroups[codeA]) {
          assoGroups[codeA] = [];
        }
        assoGroups[codeA].push({ eleve: eleve, classe: niveau });
      }
    }
  }

  // Pour chaque code ASSO, regrouper dans une seule classe
  for (const [codeA, membres] of Object.entries(assoGroups)) {
    if (membres.length < 2) continue;

    // Trouver la classe la plus représentée
    const classeCounts = {};
    for (const m of membres) {
      classeCounts[m.classe] = (classeCounts[m.classe] || 0) + 1;
    }

    // Classe cible = celle qui a le plus de membres du groupe
    let classeTarget = null;
    let maxCount = 0;
    for (const [cls, count] of Object.entries(classeCounts)) {
      if (count > maxCount) {
        maxCount = count;
        classeTarget = cls;
      }
    }

    // Déplacer tous les autres vers la classe cible
    for (const m of membres) {
      if (m.classe !== classeTarget) {
        moveEleveToClass_(classesState, m.eleve, m.classe, classeTarget);
        movedCount = movedCount + 1;
        logLine('INFO', '  ASSO : Déplacé élève code A=' + codeA + ' de ' + m.classe + ' vers ' + classeTarget);
      }
    }
  }

  return movedCount;
}

/**
 * Trouve une classe qui ne contient pas un code D donné
 */
function findClasseWithoutCode_(classesState, codeD, excludeClasse) {
  for (const [niveau, eleves] of Object.entries(classesState)) {
    if (niveau === excludeClasse) continue;

    // Vérifier si cette classe contient déjà ce code D
    const hasCode = eleves.some(function(e) {
      const d = e.DISSO || e.D || e['Code D'] || '';
      return d === codeD;
    });

    if (!hasCode) {
      return niveau;
    }
  }

  return null;
}

/**
 * Déplace un élève d'une classe à une autre
 */
function moveEleveToClass_(classesState, eleve, fromClasse, toClasse) {
  // Retirer de la classe source
  const fromEleves = classesState[fromClasse];
  const index = fromEleves.indexOf(eleve);
  if (index > -1) {
    fromEleves.splice(index, 1);
  }

  // Ajouter à la classe cible
  if (!classesState[toClasse]) {
    classesState[toClasse] = [];
  }
  classesState[toClasse].push(eleve);

  // Mettre à jour la propriété Classe de l'élève
  eleve.Classe = toClasse;
}

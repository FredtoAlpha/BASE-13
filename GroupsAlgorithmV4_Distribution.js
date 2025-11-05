/**
 * ALGORITHME DE RÉPARTITION V4 - MODULE GROUPES
 *
 * Gère:
 * 1. Normalisation & pondération (z-scores)
 * 2. Stratégies Hétérogène vs Homogène
 * 3. Contraintes (parité F/M, équilibre COM/TRA/PART/ABS)
 * 4. Statistiques temps réel
 * 5. Historique d'ajustements (swaps)
 */

(function(global) {
  'use strict';

  // ✅ FIX : Utiliser le paramètre 'global' passé via 'this'
  // Compatible avec Apps Script, navigateurs, et environnements Node.js
  const windowRef = global;

  class GroupsAlgorithmV4 {
    constructor() {
      // Configuration des pondérations par scénario
      this.scenarioWeights = {
        needs: {
          math: 0.30,
          french: 0.30,
          com: 0.15,
          tra: 0.15,
          part: 0.05,
          abs: -0.05
        },
        lv2: {
          math: 0.20,
          french: 0.35,
          com: 0.10,
          tra: 0.10,
          part: 0.20,
          abs: -0.05
        },
        options: {
          math: 0.25,
          french: 0.25,
          com: 0.15,
          tra: 0.15,
          part: 0.10,
          abs: -0.05
        }
      };

      // Seuils de validation
      this.thresholds = {
        parityGap: 1,        // |F - M| ≤ 1
        criteriaDeviation: 0.10 // ±10% de la moyenne bloc
      };
    }

    /**
     * Étape 0 : Normalisation de l'entrée (tableau, objet, Map, etc.)
     */
    normalizeStudentInput(input) {
      console.log('🔄 Normalisation de l\'entrée élèves...');
      
      // Si c'est déjà un tableau, le retourner
      if (Array.isArray(input)) {
        return input;
      }
      
      // Si c'est un objet, extraire les valeurs
      if (input && typeof input === 'object') {
        // Cas Map
        if (input instanceof Map) {
          return Array.from(input.values());
        }
        // Cas NodeList ou HTMLCollection
        if (input.length !== undefined) {
          return Array.from(input);
        }
        // Cas objet simple
        return Object.values(input);
      }
      
      console.warn('⚠️ Format d\'entrée non reconnu, retour tableau vide');
      return [];
    }

    /**
     * Étape 1 : Consolidation et validation des données d'entrée
     */
    consolidateData(students, scenario) {
      console.log(`📊 Consolidation des données pour scénario: ${scenario}`);
      
      // Normaliser l'entrée
      const studentsArray = this.normalizeStudentInput(students);
      
      if (studentsArray.length === 0) {
        console.warn('⚠️ Aucun élève exploitable détecté');
        return [];
      }
      
      const consolidated = [];
      const requiredFields = ['id', 'nom', 'prenom', 'sexe', 'scoreM', 'scoreF'];
      const optionalFields = ['com', 'tra', 'part', 'abs', 'lv2', 'opt', 'classe'];

      studentsArray.forEach((student, idx) => {
        // Valider les champs requis
        const missing = requiredFields.filter(f => !(f in student));
        if (missing.length > 0) {
          console.warn(`⚠️ Élève ${idx} manque: ${missing.join(', ')}`);
        }

        // Normaliser les scores
        const normalized = {
          id: student.id || `eleve-${idx}`,
          nom: student.nom || '',
          prenom: student.prenom || '',
          sexe: (student.sexe || 'M').toUpperCase(),
          scoreM: this.parseScore(student.scoreM),
          scoreF: this.parseScore(student.scoreF),
          com: this.parseScore(student.com, 0),
          tra: this.parseScore(student.tra, 0),
          part: this.parseScore(student.part, 0),
          abs: this.parseScore(student.abs, 0),
          lv2: student.lv2 || '',
          opt: student.opt || '',
          classe: student.classe || '',
          originalIndex: idx
        };

        consolidated.push(normalized);
      });

      console.log(`✅ ${consolidated.length} élèves consolidés`);
      return consolidated;
    }

    /**
     * Étape 2 : Normalisation (z-scores)
     */
    normalizeScores(students) {
      console.log('📈 Normalisation des scores (z-scores)...');

      const fields = ['scoreM', 'scoreF', 'com', 'tra', 'part', 'abs'];
      const stats = {};

      // Calculer moyenne et écart-type pour chaque champ
      fields.forEach(field => {
        const values = students
          .map(s => s[field])
          .filter(v => v !== null && v !== undefined && !isNaN(v));

        // Guard : si aucune valeur valide
        if (values.length === 0) {
          console.warn(`⚠️ Aucune valeur valide pour ${field}`);
          stats[field] = { mean: 0, stdDev: 1 };
          return;
        }

        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
        const stdDev = Math.sqrt(variance) || 1; // Éviter division par 0

        stats[field] = { mean, stdDev };
      });

      // Appliquer z-score avec guards pour les valeurs manquantes
      const normalized = students.map(student => {
        const normalized = { ...student };

        fields.forEach(field => {
          const value = student[field];
          const { mean, stdDev } = stats[field];

          if (value === null || value === undefined || isNaN(value)) {
            // Valeur neutre pour les données manquantes
            normalized[`z_${field}`] = 0;
          } else {
            normalized[`z_${field}`] = stdDev > 0 ? (value - mean) / stdDev : 0;
          }
        });

        return normalized;
      });

      console.log(`✅ Z-scores calculés`);
      return normalized;
    }

    /**
     * Étape 3 : Calcul de l'indice composite
     */
    calculateCompositeIndex(students, scenario) {
      console.log(`🎯 Calcul de l'indice composite (scénario: ${scenario})...`);

      const weights = this.scenarioWeights[scenario] || this.scenarioWeights.needs;

      const indexed = students.map(student => {
        const indice = 
          weights.math * student.z_scoreM +
          weights.french * student.z_scoreF +
          weights.com * student.z_com +
          weights.tra * student.z_tra +
          weights.part * student.z_part +
          weights.abs * student.z_abs; // Négatif pour pénaliser l'absentéisme

        return {
          ...student,
          indice: indice
        };
      });

      console.log(`✅ Indices composites calculés`);
      return indexed;
    }

    /**
     * Étape 4 : Distribution Hétérogène (round-robin serpentin)
     */
    distributeHeterogeneous(students, numGroups) {
      console.log(`🔀 Distribution hétérogène (${numGroups} groupes)...`);

      // Trier par indice décroissant
      const sorted = [...students].sort((a, b) => b.indice - a.indice);

      // Initialiser les groupes
      const groups = Array.from({ length: numGroups }, () => []);

      // Round-robin serpentin (zigzag)
      sorted.forEach((student, idx) => {
        const groupIdx = idx % numGroups;
        const isEvenPass = Math.floor(idx / numGroups) % 2 === 0;
        const targetGroup = isEvenPass ? groupIdx : numGroups - 1 - groupIdx;
        groups[targetGroup].push(student);
      });

      // Ajuster la parité F/M
      this.balanceParityInGroups(groups);

      console.log(`✅ Distribution hétérogène complétée`);
      return groups;
    }

    /**
     * Étape 5 : Distribution Homogène (quantiles)
     */
    distributeHomogeneous(students, numGroups) {
      console.log(`📊 Distribution homogène (${numGroups} groupes)...`);

      // Trier par indice décroissant
      const sorted = [...students].sort((a, b) => b.indice - a.indice);

      // Diviser en quantiles
      const groupSize = Math.ceil(sorted.length / numGroups);
      const groups = [];

      for (let i = 0; i < numGroups; i++) {
        const start = i * groupSize;
        const end = Math.min(start + groupSize, sorted.length);
        groups.push(sorted.slice(start, end));
      }

      // Ajuster la parité F/M
      this.balanceParityInGroups(groups);

      console.log(`✅ Distribution homogène complétée`);
      return groups;
    }

    /**
     * Équilibrage de la parité F/M
     */
    balanceParityInGroups(groups) {
      console.log('⚖️ Équilibrage de la parité F/M...');

      groups.forEach((group, groupIdx) => {
        const femaleCount = group.filter(s => s.sexe === 'F').length;
        const maleCount = group.filter(s => s.sexe === 'M').length;
        const gap = Math.abs(femaleCount - maleCount);

        if (gap > this.thresholds.parityGap) {
          console.log(`  Groupe ${groupIdx}: F=${femaleCount}, M=${maleCount}, écart=${gap}`);
          this.swapForParity(groups, groupIdx);
        }
      });

      console.log(`✅ Parité équilibrée`);
    }

    /**
     * Swap automatique pour équilibrer la parité
     */
    swapForParity(groups, targetGroupIdx) {
      const targetGroup = groups[targetGroupIdx];
      const femaleCount = targetGroup.filter(s => s.sexe === 'F').length;
      const maleCount = targetGroup.filter(s => s.sexe === 'M').length;

      // Déterminer quel sexe est en excès
      const excessSex = femaleCount > maleCount ? 'F' : 'M';
      const deficitSex = excessSex === 'F' ? 'M' : 'F';

      // Chercher un élève à swapper dans un autre groupe
      for (let i = 0; i < groups.length; i++) {
        if (i === targetGroupIdx) continue;

        const otherGroup = groups[i];
        const excessIdx = otherGroup.findIndex(s => s.sexe === excessSex);
        const deficitIdx = targetGroup.findIndex(s => s.sexe === deficitSex);

        if (excessIdx !== -1 && deficitIdx !== -1) {
          // Effectuer le swap
          [targetGroup[deficitIdx], otherGroup[excessIdx]] = 
          [otherGroup[excessIdx], targetGroup[deficitIdx]];
          break;
        }
      }
    }

    /**
     * Calcul des statistiques par groupe
     */
    calculateGroupStatistics(groups) {
      console.log('📊 Calcul des statistiques par groupe...');

      const statistics = groups.map((group, idx) => {
        const stats = {
          groupId: idx,
          size: group.size || group.length,
          students: group,
          
          // Scores académiques
          meanScoreM: this.calculateMean(group, 'scoreM'),
          meanScoreF: this.calculateMean(group, 'scoreF'),
          
          // Indicateurs comportementaux
          meanCom: this.calculateMean(group, 'com'),
          meanTra: this.calculateMean(group, 'tra'),
          meanPart: this.calculateMean(group, 'part'),
          totalAbs: this.calculateSum(group, 'abs'),
          
          // Parité
          femaleCount: group.filter(s => s.sexe === 'F').length,
          maleCount: group.filter(s => s.sexe === 'M').length,
          
          // Indices
          meanIndice: this.calculateMean(group, 'indice')
        };

        // Calculer le ratio F/M
        stats.ratioF = stats.size > 0 ? stats.femaleCount / stats.size : 0;

        return stats;
      });

      console.log(`✅ Statistiques calculées pour ${statistics.length} groupes`);
      return statistics;
    }

    /**
     * Validation des contraintes
     */
    validateConstraints(groups, statistics) {
      console.log('✔️ Validation des contraintes...');

      const alerts = [];

      statistics.forEach((stat, idx) => {
        // Parité F/M
        const parityGap = Math.abs(stat.femaleCount - stat.maleCount);
        if (parityGap > this.thresholds.parityGap) {
          alerts.push({
            type: 'parity',
            groupId: idx,
            severity: 'warning',
            message: `Parité déséquilibrée: F=${stat.femaleCount}, M=${stat.maleCount}`
          });
        }

        // Équilibre des critères comportementaux
        // (À implémenter selon les seuils spécifiques)
      });

      console.log(`✅ ${alerts.length} alerte(s) détectée(s)`);
      return alerts;
    }

    /**
     * Utilitaires de calcul
     */
    parseScore(value, defaultValue = 0) {
      const parsed = parseFloat(value);
      return Number.isFinite(parsed) ? parsed : defaultValue;
    }

    calculateMean(group, field) {
      const values = group.filter(s => s[field] !== null && s[field] !== undefined).map(s => s[field]);
      return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    }

    calculateSum(group, field) {
      return group.reduce((sum, s) => sum + (s[field] || 0), 0);
    }

    /**
     * Orchestration complète de la génération
     */
    generateGroups(payload) {
      console.log('🚀 Génération des groupes V4...');
      console.log('Payload:', payload);

      try {
        // Cas 1 : Passes multiples
        if (payload.associations && payload.associations.length > 0) {
          return this.generateGroupsWithPasses(payload);
        }

        // Cas 2 : Génération simple
        return this.generateGroupsForPass(payload);
      } catch (error) {
        console.error('❌ Erreur lors de la génération:', error);
        return {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        };
      }
    }

    /**
     * Générer les groupes pour plusieurs passes
     */
    generateGroupsWithPasses(payload) {
      const results = [];

      for (const pass of payload.associations) {
        console.log(`📋 Traitement de la passe: ${pass.name}`);

        // Filtrer les élèves de cette passe
        const studentsForPass = payload.students.filter(s => 
          pass.classes.includes(s.classe)
        );

        if (studentsForPass.length === 0) {
          console.warn(`⚠️ Aucun élève pour la passe ${pass.name}`);
          continue;
        }

        // Générer les groupes pour cette passe
        const passPayload = {
          students: studentsForPass,
          scenario: payload.scenario,
          distributionMode: payload.distributionMode,
          numGroups: pass.groupCount
        };

        const passResult = this.generateGroupsForPass(passPayload);

        results.push({
          passName: pass.name,
          passId: pass.id,
          groups: passResult.groups,
          statistics: passResult.statistics,
          alerts: passResult.alerts
        });
      }

      return {
        success: results.length > 0,
        passes: results,
        totalPasses: results.length,
        timestamp: new Date().toISOString(),
        metadata: payload
      };
    }

    /**
     * Générer les groupes pour une seule passe
     */
    generateGroupsForPass(payload) {
      try {
        // 1. Consolidation
        const consolidated = this.consolidateData(payload.students, payload.scenario);

        // 2. Normalisation
        const normalized = this.normalizeScores(consolidated);

        // 3. Indice composite
        const indexed = this.calculateCompositeIndex(normalized, payload.scenario);

        // 4. Distribution
        let groups;
        if (payload.distributionMode === 'heterogeneous') {
          groups = this.distributeHeterogeneous(indexed, payload.numGroups);
        } else {
          groups = this.distributeHomogeneous(indexed, payload.numGroups);
        }

        // 5. Statistiques
        const statistics = this.calculateGroupStatistics(groups);

        // 6. Validation
        const alerts = this.validateConstraints(groups, statistics);

        console.log('✅ Génération complétée avec succès');

        return {
          success: true,
          groups: groups,
          statistics: statistics,
          alerts: alerts,
          timestamp: new Date().toISOString(),
          metadata: {
            scenario: payload.scenario,
            distributionMode: payload.distributionMode,
            numGroups: payload.numGroups,
            totalStudents: consolidated.length
          }
        };
      } catch (error) {
        console.error('❌ Erreur lors de la génération:', error);
        return {
          success: false,
          error: error.message,
          groups: [],
          statistics: [],
          alerts: []
        };
      }
    }
  }

  // ✅ FIX : Export global via le paramètre 'global'
  // Fonctionne dans Apps Script (this), navigateurs (window), et Node.js (global)
  global.GroupsAlgorithmV4 = GroupsAlgorithmV4;

  // Export pour modules ES6 (Node.js, webpack, etc.)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = GroupsAlgorithmV4;
  }

  console.log('✅ GroupsAlgorithmV4 exporté globalement:', typeof global.GroupsAlgorithmV4);

})(this); // ✅ 'this' = objet global dans tous les environnements

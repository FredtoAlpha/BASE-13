/**
 * GESTIONNAIRE DE SWAPS ET HISTORIQUE V4
 * 
 * Gère:
 * 1. Swaps manuels (drag & drop)
 * 2. Historique d'ajustements
 * 3. Undo/Redo
 * 4. Recalcul des statistiques
 * 5. Validation des contraintes
 */

(function(global) {
  'use strict';

  // Détection robuste de l'objet global
  const windowRef = typeof window !== 'undefined' 
    ? window 
    : typeof global !== 'undefined' 
      ? global 
      : typeof globalThis !== 'undefined'
        ? globalThis
        : {};

  class GroupsSwapManager {
    constructor(algorithm) {
      this.algorithm = algorithm;
      this.history = [];
      this.future = [];
      this.currentState = null;
      this.maxHistorySize = 50;
    }

    /**
     * Créer un snapshot de l'état actuel
     */
    createSnapshot(groups, statistics, metadata = {}) {
      return {
        timestamp: new Date().toISOString(),
        groups: this.deepCloneGroups(groups),
        statistics: JSON.parse(JSON.stringify(statistics)),
        metadata: metadata
      };
    }

    /**
     * Cloner profondément les groupes
     */
    deepCloneGroups(groups) {
      return groups.map(group => 
        group.map(student => ({ ...student }))
      );
    }

    /**
     * Effectuer un swap entre deux élèves
     */
    performSwap(groups, statistics, fromGroupIdx, fromStudentIdx, toGroupIdx, toStudentIdx) {
      console.log(`🔄 Swap: Groupe ${fromGroupIdx}[${fromStudentIdx}] ↔ Groupe ${toGroupIdx}[${toStudentIdx}]`);

      // Créer un snapshot avant le swap
      const beforeSnapshot = this.createSnapshot(groups, statistics, {
        action: 'swap',
        from: { groupIdx: fromGroupIdx, studentIdx: fromStudentIdx },
        to: { groupIdx: toGroupIdx, studentIdx: toStudentIdx }
      });

      // Effectuer le swap
      const clonedGroups = this.deepCloneGroups(groups);
      [clonedGroups[fromGroupIdx][fromStudentIdx], clonedGroups[toGroupIdx][toStudentIdx]] =
      [clonedGroups[toGroupIdx][toStudentIdx], clonedGroups[fromGroupIdx][fromStudentIdx]];

      // Recalculer les statistiques
      const newStatistics = this.algorithm.calculateGroupStatistics(clonedGroups);

      // Valider les contraintes
      const alerts = this.algorithm.validateConstraints(clonedGroups, newStatistics);

      // Ajouter à l'historique
      this.addToHistory(beforeSnapshot);
      this.currentState = this.createSnapshot(clonedGroups, newStatistics, {
        action: 'swap_completed',
        alerts: alerts
      });

      // Effacer le futur (redo) après une nouvelle action
      this.future = [];

      console.log(`✅ Swap complété. ${alerts.length} alerte(s)`);

      return {
        success: true,
        groups: clonedGroups,
        statistics: newStatistics,
        alerts: alerts,
        snapshot: this.currentState
      };
    }

    /**
     * Swap suggéré automatique pour corriger un déséquilibre
     */
    suggestSwap(groups, statistics, targetGroupIdx) {
      console.log(`💡 Suggestion de swap pour le groupe ${targetGroupIdx}...`);

      const targetGroup = groups[targetGroupIdx];
      const targetStats = statistics[targetGroupIdx];

      // Analyser les déséquilibres
      const issues = [];

      // Parité F/M
      const parityGap = Math.abs(targetStats.femaleCount - targetStats.maleCount);
      if (parityGap > this.algorithm.thresholds.parityGap) {
        issues.push({
          type: 'parity',
          gap: parityGap,
          excessSex: targetStats.femaleCount > targetStats.maleCount ? 'F' : 'M'
        });
      }

      // Chercher un swap bénéfique
      if (issues.length > 0) {
        const issue = issues[0];
        
        if (issue.type === 'parity') {
          // Chercher un élève du sexe opposé dans un autre groupe
          for (let i = 0; i < groups.length; i++) {
            if (i === targetGroupIdx) continue;

            const otherGroup = groups[i];
            const otherStats = statistics[i];
            const targetSex = issue.excessSex === 'F' ? 'M' : 'F';

            // Trouver un élève du sexe opposé
            const studentIdx = otherGroup.findIndex(s => s.sexe === targetSex);
            if (studentIdx !== -1) {
              return {
                suggested: true,
                fromGroupIdx: i,
                fromStudentIdx: studentIdx,
                toGroupIdx: targetGroupIdx,
                toStudentIdx: targetGroup.findIndex(s => s.sexe === issue.excessSex),
                reason: `Corriger parité (écart: ${parityGap})`
              };
            }
          }
        }
      }

      return { suggested: false };
    }

    /**
     * Ajouter à l'historique
     */
    addToHistory(snapshot) {
      this.history.push(snapshot);

      // Limiter la taille de l'historique
      if (this.history.length > this.maxHistorySize) {
        this.history.shift();
      }
    }

    /**
     * Undo
     */
    undo() {
      if (this.history.length === 0) {
        console.warn('⚠️ Aucune action à annuler');
        return { success: false };
      }

      console.log('↶ Undo...');

      // Sauvegarder l'état actuel dans le futur
      if (this.currentState) {
        this.future.push(this.currentState);
      }

      // Restaurer l'état précédent
      this.currentState = this.history.pop();

      console.log('✅ Undo complété');

      return {
        success: true,
        groups: this.deepCloneGroups(this.currentState.groups),
        statistics: this.currentState.statistics,
        snapshot: this.currentState
      };
    }

    /**
     * Redo
     */
    redo() {
      if (this.future.length === 0) {
        console.warn('⚠️ Aucune action à refaire');
        return { success: false };
      }

      console.log('↷ Redo...');

      // Sauvegarder l'état actuel dans l'historique
      if (this.currentState) {
        this.history.push(this.currentState);
      }

      // Restaurer l'état suivant
      this.currentState = this.future.pop();

      console.log('✅ Redo complété');

      return {
        success: true,
        groups: this.deepCloneGroups(this.currentState.groups),
        statistics: this.currentState.statistics,
        snapshot: this.currentState
      };
    }

    /**
     * Obtenir l'historique complet
     */
    getHistory() {
      return this.history.map((snapshot, idx) => ({
        index: idx,
        timestamp: snapshot.timestamp,
        action: snapshot.metadata.action,
        description: this.describeAction(snapshot.metadata)
      }));
    }

    /**
     * Décrire une action pour l'affichage
     */
    describeAction(metadata) {
      if (metadata.action === 'swap') {
        return `Swap: Groupe ${metadata.from.groupIdx}[${metadata.from.studentIdx}] ↔ Groupe ${metadata.to.groupIdx}[${metadata.to.studentIdx}]`;
      }
      return metadata.action || 'Action inconnue';
    }

    /**
     * Restaurer à un point de l'historique
     */
    restoreToSnapshot(snapshotIndex) {
      if (snapshotIndex < 0 || snapshotIndex >= this.history.length) {
        console.warn('⚠️ Index de snapshot invalide');
        return { success: false };
      }

      console.log(`⏮️ Restauration au snapshot ${snapshotIndex}...`);

      // Sauvegarder les états suivants dans le futur
      for (let i = this.history.length - 1; i > snapshotIndex; i--) {
        this.future.unshift(this.history[i]);
      }

      // Restaurer
      this.currentState = this.history[snapshotIndex];
      this.history = this.history.slice(0, snapshotIndex);

      console.log('✅ Restauration complétée');

      return {
        success: true,
        groups: this.deepCloneGroups(this.currentState.groups),
        statistics: this.currentState.statistics,
        snapshot: this.currentState
      };
    }

    /**
     * Exporter l'historique en JSON
     */
    exportHistory() {
      return {
        timestamp: new Date().toISOString(),
        historySize: this.history.length,
        history: this.history.map((snapshot, idx) => ({
          index: idx,
          ...snapshot
        }))
      };
    }

    /**
     * Importer un historique
     */
    importHistory(data) {
      try {
        this.history = data.history || [];
        this.future = [];
        this.currentState = this.history.length > 0 
          ? this.history[this.history.length - 1]
          : null;

        console.log(`✅ Historique importé (${this.history.length} snapshots)`);
        return { success: true };
      } catch (error) {
        console.error('❌ Erreur lors de l\'import:', error);
        return { success: false, error: error.message };
      }
    }

    /**
     * Réinitialiser l'historique
     */
    reset() {
      console.log('🔄 Réinitialisation de l\'historique...');
      this.history = [];
      this.future = [];
      this.currentState = null;
      console.log('✅ Historique réinitialisé');
    }
  }

  // Exporter la classe
  windowRef.GroupsSwapManager = GroupsSwapManager;

  // Export pour modules ES6
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = GroupsSwapManager;
  }

})(typeof window !== 'undefined' 
  ? window 
  : typeof global !== 'undefined' 
    ? global 
    : typeof globalThis !== 'undefined'
      ? globalThis
      : {});

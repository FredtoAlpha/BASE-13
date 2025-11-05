# Module Groupes V4 - Interface Triptyque

Module autonome de génération de groupes d'élèves pour Google Apps Script.

## 📦 Contenu

### Scripts principaux
- **`GroupsAlgorithmV4_Distribution.js`** : Algorithme de répartition (hétérogène/homogène)
- **`InterfaceV4_Triptyque_Logic.js`** : Interface triptyque 30/40/30 avec gestion d'état
- **`InterfaceV2_GroupsModuleV4_Script.js`** : Loader minimal pour InterfaceV2.html

### Templates
- **`InterfaceV2_GroupsModuleV4_Part1_RESTORED.html`** : Template de référence HTML complet

### Tests
- **`TEST_Module_Groupes_V4_Standalone.html`** : Fichier de test avec données simulées

### Documentation
- **`RAPPORT_RESTAURATION_GROUPES_V4.md`** : Rapport complet de restauration
- **`CORRECTIONS_SESSION_FINALE_04NOV2025.md`** : Dernières corrections appliquées

## 🚀 Démarrage rapide

### Test standalone
```bash
# Ouvrir dans un navigateur
open TEST_Module_Groupes_V4_Standalone.html
```

### Intégration dans InterfaceV2.html
```html
<!-- Inclusions server-side dans InterfaceV2.html -->
<?!= include('GroupsAlgorithmV4_Distribution'); ?>
<?!= include('InterfaceV4_Triptyque_Logic'); ?>
<?!= include('InterfaceV2_GroupsModuleV4_Script'); ?>
```

## 🎯 Fonctionnalités

### Interface triptyque (30/40/30)
- **Colonne A (30%)** : Scénarios (Besoins/LV2/Options) + Modes (Hétérogène/Homogène)
- **Colonne B (40%)** : Configuration des regroupements + Gestion des classes
- **Colonne C (30%)** : Preview des groupes générés + Statistiques + Carrousel

### Algorithme de répartition
- ✅ Normalisation z-scores (maths, français, comportement)
- ✅ Indices composites pondérés par scénario
- ✅ Distribution hétérogène (round-robin serpentin)
- ✅ Distribution homogène (quantiles)
- ✅ Équilibrage parité F/M
- ✅ Statistiques détaillées (effectifs, moyennes, parité)

### Événements
- `groups:generate` : Déclenchement de la génération
- `groups:generated` : Résultats de génération disponibles
- `groups:error` : Erreur de génération

## 📊 État du projet

**Version** : V4.0
**Statut** : ✅ Fonctionnel (~45% complété)
**Dernière mise à jour** : 4 novembre 2025

### Complété
- ✅ Structure HTML triptyque 30/40/30
- ✅ Algorithme de répartition complet
- ✅ Gestion d'état centralisée
- ✅ Preview des groupes générés
- ✅ Navigation carrousel
- ✅ Statistiques temps réel

### En cours
- 🔄 Swap manuel entre élèves
- 🔄 Sauvegarde brouillon/final
- 🔄 Export CSV
- 🔄 Raccourcis clavier (Alt+1/2/3)

### À venir
- ⏳ Tests E2E automatisés
- ⏳ Accessibilité complète (ARIA)
- ⏳ Documentation utilisateur
- ⏳ Déploiement production

## 🧪 Tests

### Scénarios de test
1. **Génération hétérogène** : 3 classes (24 élèves) → 4 groupes
2. **Génération homogène** : 2 classes (16 élèves) → 3 groupes
3. **Navigation carrousel** : 3 regroupements différents
4. **Réinitialisation** : Vérifier le retour à l'état initial

## 📝 Dépendances

- **Environnement** : Google Apps Script (GAS) ou navigateur moderne
- **Données** : `window.STATE.classesData` ou `GROUPS_MODULE_V4_DATA`
- **Aucune librairie externe** : Vanilla JavaScript uniquement

## 🔗 Intégration

### Backend (Code.gs)
```javascript
function getGroupsModuleV4Data() {
  // Retourner les données de classes
  return {
    classes: getClasses(),
    eleves: getEleves()
  };
}
```

### Frontend (InterfaceV2.html)
```javascript
// Injection des données
window.GROUPS_MODULE_V4_DATA = <?= JSON.stringify(getGroupsModuleV4Data()) ?>;

// Ouverture du module
function openModuleGroupsV4() {
  ModuleGroupsV4.open();
}
```

## 📞 Support

Pour toute question ou problème :
- Consulter `RAPPORT_RESTAURATION_GROUPES_V4.md`
- Consulter `CORRECTIONS_SESSION_FINALE_04NOV2025.md`
- Vérifier les logs de la console navigateur (F12)

---

**Développé par** : Claude AI
**Session** : claude/groups-module-v4-clean-011CUoSa1Lo8CaN7dR1mWDnK
**Date** : Novembre 2025

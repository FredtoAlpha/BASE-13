/**
 * UTILITY FUNCTIONS
 * Fonctions utilitaires globales
 * Extrait de InterfaceV2_CoreScript.html pour modularité
 */

const hasWindow = typeof window !== 'undefined';
const hasDocument = typeof document !== 'undefined';

// ========== APPELS GOOGLE APPS SCRIPT ==========
function gsRun(fnName, ...args) {
  return new Promise((resolve, reject) => {
    console.log(`📡 Appel fonction: ${fnName}`);
    
    if (typeof google !== 'undefined' && google.script && google.script.run) {
      google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler((err) => {
          console.error(`❌ Erreur ${fnName}:`, err);
          reject(err);
        })
        [fnName](...args);
    } else {
      console.warn(`⚠️ Mode développement: ${fnName} non disponible`);
      reject(new Error('Google Apps Script non disponible'));
    }
  });
}

// ========== FONCTION AFFICHAGE D'ERREUR UNIVERSELLE ==========
function showErrorState(message, suggestions = []) {
  if (!hasDocument) {
    console.warn('showErrorState ignoré: document indisponible.');
    return;
  }

  const board = document.getElementById('board');
  if (!board) {
    console.error('Board introuvable');
    return;
  }
  
  board.innerHTML = `
    <div class="error-state">
      <div class="error-icon">⚠️</div>
      <h2 class="error-title">Erreur de chargement</h2>
      <p class="error-message">${message}</p>
      ${suggestions.length > 0 ? `
        <div class="error-suggestions">
          <h3>Suggestions :</h3>
          <ul>
            ${suggestions.map(s => `<li>${s}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
      <button onclick="location.reload()" class="error-retry-btn">
        <i class="fas fa-redo mr-2"></i>Réessayer
      </button>
    </div>
  `;
}

// ========== DÉTECTION AUTOMATIQUE DU NIVEAU ==========
function detectNiveau(data) {
  if (!data || data.length === 0) return '';
  
  const classes = [...new Set(data.map(e => e.classe))];
  
  if (classes.some(c => c && c.startsWith('6'))) return '6ème';
  if (classes.some(c => c && c.startsWith('5'))) return '5ème';
  if (classes.some(c => c && c.startsWith('4'))) return '4ème';
  if (classes.some(c => c && c.startsWith('3'))) return '3ème';
  
  return 'Niveau non détecté';
}

// ========== FONCTION DE TRI DES COLONNES ==========
function sortColumn(classe, sortType, direction = 'asc') {
  if (!hasDocument) {
    console.warn('sortColumn ignoré: document indisponible.');
    return;
  }

  const dropZone = document.querySelector(`.droppable-zone[data-classe="${classe}"]`);
  if (!dropZone) return;
  
  const cards = Array.from(dropZone.querySelectorAll('.student-card'));
  
  cards.sort((a, b) => {
    let valA, valB;
    
    switch(sortType) {
      case 'nom':
        valA = a.dataset.nom || '';
        valB = b.dataset.nom || '';
        break;
      case 'prenom':
        valA = a.dataset.prenom || '';
        valB = b.dataset.prenom || '';
        break;
      case 'lv2':
        valA = a.dataset.lv2 || '';
        valB = b.dataset.lv2 || '';
        break;
      case 'besoin':
        valA = a.dataset.besoin || '';
        valB = b.dataset.besoin || '';
        break;
      default:
        return 0;
    }
    
    const comparison = valA.localeCompare(valB, 'fr', { sensitivity: 'base' });
    return direction === 'asc' ? comparison : -comparison;
  });
  
  // Réinsérer les cartes dans l'ordre
  cards.forEach(card => dropZone.appendChild(card));
  
  // Sauvegarder l'ordre de tri
  if (hasWindow && window.STATE && window.STATE.sortOrder) {
    window.STATE.sortOrder[classe] = { type: sortType, dir: direction };
  }
}

// ========== FONCTION DE VALIDATION DES MOUVEMENTS ==========
function canMove(eleveId, srcClasse, dstClasse) {
  if (hasWindow && window.STATE && (window.STATE.adminMode || srcClasse === dstClasse)) {
    return { ok: true };
  }
  
  // Logique de validation à implémenter selon les règles métier
  return { ok: true };
}

// ========== FONCTION UTILITAIRE POUR RÉCUPÉRER LE CONTENU D'UNE CLASSE ==========
function getCurrentClassContent(classe) {
  if (!hasDocument) {
    console.warn('getCurrentClassContent ignoré: document indisponible.');
    return [];
  }

  const dropZone = document.querySelector(`.droppable-zone[data-classe="${classe}"]`);
  if (!dropZone) return [];
  
  return Array.from(dropZone.querySelectorAll('.student-card'))
    .map(card => card.dataset.id);
}

// ========== AJUSTEMENT TAILLE DES CARTES ==========
function resizeCards() {
  if (!hasDocument) {
    console.warn('resizeCards ignoré: document indisponible.');
    return;
  }

  document.querySelectorAll('.student-card').forEach(card => {
    const w = card.offsetWidth;
    if (w < 120) {
      card.classList.add('compact');
    } else {
      card.classList.remove('compact');
    }
  });
}

// Exposer globalement uniquement si le contexte navigateur est disponible
if (hasWindow) {
  window.gsRun = gsRun;
  window.showErrorState = showErrorState;
  window.detectNiveau = detectNiveau;
  window.sortColumn = sortColumn;
  window.canMove = canMove;
  window.getCurrentClassContent = getCurrentClassContent;
  window.resizeCards = resizeCards;
}

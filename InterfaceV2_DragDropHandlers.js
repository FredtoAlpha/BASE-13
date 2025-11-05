/**
 * DRAG & DROP HANDLERS
 * Gestion des événements de glisser-déposer
 * Extrait de InterfaceV2_CoreScript.html pour modularité
 */

// ========== HANDLERS DRAG & DROP ==========
function handleDragStart(e) {
  if (window.STATE && window.STATE.swapMode) return; // Pas de drag en mode swap

  const card = e.currentTarget;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', card.innerHTML);
  e.dataTransfer.setData('studentId', card.dataset.id);
  
  card.classList.add('dragging');
  
  if (window.STATE) {
    window.STATE.draggedCard = card;
  }
}

function handleDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  
  document.querySelectorAll('.droppable-zone').forEach(zone => {
    zone.classList.remove('drag-over', 'drop-forbidden');
  });
  
  if (window.STATE) {
    window.STATE.draggedCard = null;
  }
}

function handleDragOver(e) {
  if (e.preventDefault) e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  return false;
}

function handleDragEnter(e) {
  const zone = e.currentTarget;
  const studentId = e.dataTransfer.getData('studentId');
  
  if (!studentId) return;
  
  const srcCard = document.querySelector(`.student-card[data-id="${studentId}"]`);
  if (!srcCard) return;
  
  const srcClasse = srcCard.closest('.droppable-zone')?.dataset.classe;
  const dstClasse = zone.dataset.classe;
  
  if (typeof canMove === 'function') {
    const check = canMove(studentId, srcClasse, dstClasse);
    if (check.ok) {
      zone.classList.add('drag-over');
      zone.classList.remove('drop-forbidden');
    } else {
      zone.classList.add('drop-forbidden');
      zone.classList.remove('drag-over');
    }
  } else {
    zone.classList.add('drag-over');
  }
}

function handleDragLeave(e) {
  e.currentTarget.classList.remove('drag-over', 'drop-forbidden');
}

// Exposer globalement (compatibilité Apps Script + navigateur)
const globalRef = typeof globalThis !== 'undefined' ? globalThis :
                   typeof window !== 'undefined' ? window :
                   typeof self !== 'undefined' ? self : {};

if (globalRef) {
  globalRef.handleDragStart = handleDragStart;
  globalRef.handleDragEnd = handleDragEnd;
  globalRef.handleDragOver = handleDragOver;
  globalRef.handleDragEnter = handleDragEnter;
  globalRef.handleDragLeave = handleDragLeave;
}

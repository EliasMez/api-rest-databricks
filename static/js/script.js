
let maxValue = 0;

const topInput = document.getElementById("topValue");
const tableSelect = document.getElementById("tableSelect");
const filtersContainer = document.getElementById("filtersContainer");

/* ---------- utilitaires ---------- */
function adjustTopInputWidth(value) {
    const mirror = document.createElement("span");
    mirror.style.visibility = "hidden";
    mirror.style.position = "absolute";
    mirror.style.whiteSpace = "pre";

    const styles = getComputedStyle(topInput);
    mirror.style.fontSize = styles.fontSize;
    mirror.style.fontFamily = styles.fontFamily;
    mirror.style.fontWeight = styles.fontWeight;

    mirror.textContent = value;

    document.body.appendChild(mirror);
    const width = mirror.offsetWidth;
    document.body.removeChild(mirror);

    topInput.style.width = `${Math.max(40, width + 16)}px`;
}

topInput.addEventListener("keydown", (e) => {
    if (topInput.value === "0" && e.key >= "0" && e.key <= "9") {
        topInput.value = "";
    }
});

topInput.addEventListener("input", () => {
    let value = parseInt(topInput.value);

    if (isNaN(value) || value < 0) value = 0;
    if (value > maxValue) value = maxValue;

    topInput.value = value;
    adjustTopInputWidth(value);
    updateApplyState();
});

function setMin() {
    topInput.value = 0;
    updateApplyState();
    adjustTopInputWidth(0);
}

function setMax() {
    topInput.value = maxValue;
    updateApplyState();
    adjustTopInputWidth(maxValue);
}

/* ---------- visibilité du bouton Reset Filters ---------- */
function updateResetVisibility() {
    const resetBtn = document.querySelector(".add-row .reset-btn");
    if (!resetBtn) return;
    const count = filtersContainer.querySelectorAll(".filter-row").length;
    resetBtn.style.display = (count >= 2) ? "inline-block" : "none";
}

/* ---------- changement de table ---------- */
tableSelect.addEventListener("change", resetFiltersOnTableChange);

function resetFiltersOnTableChange() {
    const table = tableSelect.value;
    if (!table) return;

    // Supprime toutes les lignes de filtre sauf la première
    const rows = filtersContainer.querySelectorAll(".filter-row");
    rows.forEach((row, index) => {
        if (index > 0) row.remove();
    });

    // Réinit la première ligne (valeurs vides)
    const firstRow = filtersContainer.querySelector(".filter-row");
    const firstSelect = firstRow.querySelector(".columnSelect");
    const firstValue = firstRow.querySelector(".filterValue");

    firstSelect.value = "";
    firstValue.value = "";

    // Recrée proprement l'unique add-row en bas
    const existingAdds = filtersContainer.querySelectorAll(".add-row");
    existingAdds.forEach(a => a.remove());
    filtersContainer.appendChild(createAddRow());
    updateAddButtonState();
    updateResetVisibility();

    // Charge colonnes
    fetch(`/columns/${table}`)
        .then(res => res.json())
        .then(cols => {
            loadColumnsIntoSelect(firstSelect, cols);
            updateColumnOptions();
            updateAddButtonState();
            updateResetVisibility();
        });

    // Met à jour la valeur max (rowcount)
    fetch(`/rowcount/${table}`)
        .then(res => res.json())
        .then(data => {
            maxValue = data.row_count;
            adjustTopInputWidth(maxValue);

            if (parseInt(topInput.value) > maxValue) {
                topInput.value = maxValue;
            }
            updateApplyState();
        });

    updateApplyState();
}

/* ---- Ajout/Suppression de lignes ---- */

function createAddRow() {
    const row = document.createElement("div");
    row.className = "row add-row";
    row.innerHTML = `
        <div class="add-placeholder add-placeholder--select"></div>
        <div class="add-placeholder add-placeholder--value"></div>
        <div class="actions">
            <button class="btn reset-btn" title="Réinitialiser les filtres" onclick="resetFilters()">Reset Filters</button>
            <button class="btn add-btn" title="Ajouter un filtre en dessous">+</button>
        </div>
    `;
    return row;
}

// Délégation : un seul +, toujours en bas. Au clic : l'add-row devient une filter-row et on recrée le + en dessous.
filtersContainer.addEventListener("click", (e) => {
    if (!e.target.classList.contains("add-btn")) return;

    // Bloque l'ajout si au moins une ligne au-dessus n'a pas de colonne sélectionnée
    if (!areAllFiltersHaveColumnSelected()) return;

    const addRow = e.target.closest(".add-row");
    if (!addRow) return;

    // Transforme l'add-row en ligne de filtre
    addRow.className = "row filter-row";
    addRow.innerHTML = `
        <select class="columnSelect" required>
            <option value="" disabled hidden selected>-- column --</option>
        </select>
        <input type="text" class="filterValue" placeholder="Valeur">
        <button class="btn" onclick="removeFilterRow(this)">−</button>
    `;

    // Charger colonnes pour la nouvelle ligne si table sélectionnée
    const table = tableSelect.value;
    if (table) {
        fetch(`/columns/${table}`)
            .then(res => res.json())
            .then(cols => {
                const sel = addRow.querySelector(".columnSelect");
                loadColumnsIntoSelect(sel, cols);
                updateColumnOptions();
                updateAddButtonState();
                updateResetVisibility();
            });
    } else {
        updateAddButtonState();
        updateResetVisibility();
    }

    // Recrée UNE add-row en bas et met à jour l'état du bouton
    const existingAdds = filtersContainer.querySelectorAll(".add-row");
    existingAdds.forEach(a => a.remove());
    filtersContainer.appendChild(createAddRow());
    updateAddButtonState();
    updateResetVisibility();
});

function removeFilterRow(btn) {
    const rows = filtersContainer.querySelectorAll(".filter-row");
    const row = btn.closest(".filter-row");

    if (rows.length === 1) {
        // Réinitialise la seule ligne au lieu de la supprimer
        const sel = row.querySelector(".columnSelect");
        const inp = row.querySelector(".filterValue");

        sel.value = "";
        inp.value = "";

        updateColumnOptions();
        updateAddButtonState();
        updateApplyState();
        updateResetVisibility();
        return;
    }

    // Comportement normal si plusieurs lignes
    row.remove();
    updateColumnOptions();

    // S'il n'y a plus de add-row, on en recrée une en bas
    const hasAdd = !!filtersContainer.querySelector(".add-row");
    if (!hasAdd) {
        filtersContainer.appendChild(createAddRow());
    }
    updateAddButtonState();
    updateResetVisibility();
}

/* ---- Reset Filters ---- */
function resetFilters() {
    // Supprime toutes les lignes de filtre sauf la première
    const rows = filtersContainer.querySelectorAll(".filter-row");
    rows.forEach((row, i) => { if (i > 0) row.remove(); });

    // Réinitialise la première ligne
    const firstRow   = filtersContainer.querySelector(".filter-row");
    const firstSel   = firstRow.querySelector(".columnSelect");
    const firstInput = firstRow.querySelector(".filterValue");

    firstSel.value = "";
    firstInput.value = "";

    // Recrée proprement l'unique add-row en bas
    const existingAdds = filtersContainer.querySelectorAll(".add-row");
    existingAdds.forEach(a => a.remove());
    filtersContainer.appendChild(createAddRow());

    // Rafraîchit l’UI
    updateColumnOptions();
    updateAddButtonState();
    updateApplyState();
    updateResetVisibility();
}

/* ---- Gestion des options ---- */

filtersContainer.addEventListener("change", (e) => {
    if (e.target.classList.contains("columnSelect")) {
        updateColumnOptions();
        updateAddButtonState();
        updateResetVisibility();
    }
});

filtersContainer.addEventListener("input", (e) => {
    if (e.target.classList.contains("filterValue")) {
        updateAddButtonState();
        updateResetVisibility();
    }
});

function updateColumnOptions() {
    const selects = document.querySelectorAll(".columnSelect");
    const selected = Array.from(selects)
        .map(s => s.value)
        .filter(v => v !== "");

    selects.forEach(select => {
        const current = select.value;

        Array.from(select.options).forEach(option => {
            if (option.value === "") return; // ignore placeholder
            option.hidden =
                option.value !== current &&
                selected.includes(option.value);
        });
    });
}

/* ---- Placeholder centralisé (no duplication) ---- */
function loadColumnsIntoSelect(selectElement, cols) {
    const wasEmpty = !selectElement.value || selectElement.value === "";
    const current = wasEmpty ? "" : selectElement.value;

    // Placeholder visible dans le champ, caché dans la liste
    const placeholder = `<option value="" disabled hidden ${wasEmpty ? "selected" : ""}>-- column --</option>`;

    selectElement.innerHTML =
        placeholder +
        cols.map(c => `<option value="${c}">${c}</option>`).join("");

    // Si une valeur existante doit être conservée
    if (current && cols.includes(current)) {
        selectElement.value = current;
    }

    updateAddButtonState();
    updateResetVisibility();
}

/* ---- Règle "+" actif uniquement si TOUTES les lignes ont une colonne sélectionnée ---- */
function areAllFiltersHaveColumnSelected() {
    const rows = filtersContainer.querySelectorAll(".filter-row");
    if (rows.length === 0) return false;
    for (const row of rows) {
        const col = row.querySelector(".columnSelect")?.value || "";
        if (col === "") return false;
    }
    return true;
}

function updateAddButtonState() {
    const addBtn = filtersContainer.querySelector(".add-row .add-btn");
    if (!addBtn) return;
    addBtn.disabled = !areAllFiltersHaveColumnSelected();
}

/* ---- Apply ---- */

function applyFilters() {
    const table = tableSelect.value;
    const topValueLocal = topInput.value;

    let url = `/${table}?top=${encodeURIComponent(topValueLocal)}`;

    document.querySelectorAll(".filter-row").forEach(row => {
        const col = row.querySelector(".columnSelect").value;
        const val = row.querySelector(".filterValue").value;

        if (col && val) {
            url += `&col=${encodeURIComponent(col)}&val=${encodeURIComponent(val)}`;
        }
    });

    window.location.href = url;
}

function updateApplyState() {
    const applyBtn = document.querySelector(".btn.apply");
    applyBtn.disabled = !tableSelect.value || topInput.value === "0";
}

/* ---- Init ---- */
adjustTopInputWidth(topInput.value);
tableSelect.addEventListener("change", updateApplyState);
updateApplyState();
updateAddButtonState();
updateResetVisibility();

// Si une table est déjà sélectionnée au chargement (reload), on initialise colonnes/rowcount.
if (tableSelect.value !== "") {
    resetFiltersOnTableChange();
}
// ============== FRONTEND (house_expense.js) =======================
var expense_id;
var return_money_id;
window.houseExpenseLastRows = [];
window.houseExpenseBreakdownState = {
    rows: [],
    sortKey: 'date_time',
    sortDir: 'desc'
};

/** Main category explorer + graph (shared by settlement date and date range). */
window.houseExpenseExplorerState = {
    mainCategory: null,
    subCategory: null
};

var HOUSE_EXPENSE_RETURN_MONEY_LABEL = 'Return Money';

var HOUSE_EXPENSE_MODAL_SELECTORS = [
    '#modal-house-expense-quick-category',
    '#modal-new-house-expense',
    '#modal-edit-house-expense',
    '#modal-new-return-money',
    '#modal-edit-return-money',
    '#modal-expense-breakdown-details',
    '#modal-house-expense-edit-history'
];

function mountHouseExpenseModals() {
    HOUSE_EXPENSE_MODAL_SELECTORS.forEach(function (selector) {
        var el = document.querySelector(selector);
        if (el && el.parentElement !== document.body) {
            document.body.appendChild(el);
        }
    });
}

function showBootstrapModal($modal, options) {
    if (!$modal || !$modal.length) return null;
    options = options || {};
    $modal.appendTo('body');
    if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
        var instance = bootstrap.Modal.getOrCreateInstance($modal[0], {
            backdrop: options.backdrop != null ? options.backdrop : 'static',
            keyboard: options.keyboard != null ? options.keyboard : false
        });
        instance.show();
        return instance;
    }
    if ($.fn.modal) {
        $modal.modal('show');
    }
    return null;
}

function hideBootstrapModal($modal) {
    if (!$modal || !$modal.length) return;
    if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
        var instance = bootstrap.Modal.getInstance($modal[0]);
        if (instance) {
            instance.hide();
            return;
        }
    }
    if ($.fn.modal) {
        $modal.modal('hide');
    }
}

window.houseExpenseCategoryTree = [];
window.houseExpenseCategoryFlat = [];

function buildHouseExpenseCategoryTreeFromFlat(rows) {
    var list = rows || [];
    if (list.length && list[0] && list[0].children && !list[0].PARENT_ID && list[0].IDNo) {
        return list.slice();
    }
    var mains = [];
    var subsByParent = {};
    list.forEach(function (row) {
        if (!row || row.IDNo == null) return;
        var pid = row.PARENT_ID != null ? Number(row.PARENT_ID) : null;
        if (pid && !Number.isNaN(pid)) {
            if (!subsByParent[pid]) subsByParent[pid] = [];
            subsByParent[pid].push(row);
        } else {
            mains.push({
                IDNo: row.IDNo,
                CATEGORY: row.CATEGORY,
                PARENT_ID: null,
                children: []
            });
        }
    });
    mains.sort(function (a, b) {
        return String(a.CATEGORY).localeCompare(String(b.CATEGORY), undefined, { sensitivity: 'base' });
    });
    mains.forEach(function (main) {
        main.children = (subsByParent[main.IDNo] || []).sort(function (a, b) {
            return String(a.CATEGORY).localeCompare(String(b.CATEGORY), undefined, { sensitivity: 'base' });
        });
    });
    return mains;
}

function flattenHouseExpenseCategoryTree(tree) {
    var flat = [];
    (tree || []).forEach(function (main) {
        if (!main || main.IDNo == null) return;
        flat.push({ IDNo: main.IDNo, CATEGORY: main.CATEGORY, PARENT_ID: null });
        (main.children || []).forEach(function (sub) {
            if (!sub || sub.IDNo == null) return;
            flat.push({ IDNo: sub.IDNo, CATEGORY: sub.CATEGORY, PARENT_ID: main.IDNo });
        });
    });
    return flat;
}

function getHouseExpenseCategoryTree() {
    if (window.houseExpenseCategoryTree && window.houseExpenseCategoryTree.length) {
        return window.houseExpenseCategoryTree;
    }
    var catalog = window.houseExpenseCategoryCatalog || [];
    if (catalog.length && catalog[0] && typeof catalog[0] === 'object') {
        return buildHouseExpenseCategoryTreeFromFlat(catalog);
    }
    return [];
}

function cacheHouseExpenseCategoryData(rows) {
    window.houseExpenseCategoryFlat = rows || [];
    window.houseExpenseCategoryTree = buildHouseExpenseCategoryTreeFromFlat(rows);
}

function getHouseExpenseMainCategoryIdByName(mainName) {
    if (!mainName || isHouseExpenseReturnMoneyMain(mainName)) return null;
    var tree = getHouseExpenseCategoryTree();
    var main = tree.find(function (m) {
        return String(m.CATEGORY || '').trim() === String(mainName).trim();
    });
    return main ? main.IDNo : null;
}

function canManageHouseExpenseCategories() {
    return !!(window.PermissionViewOnly && window.PermissionViewOnly.isExpenseHandler());
}

function syncHouseExpenseExplorerStateAfterCategoryRename(categoryId, newName) {
    var st = window.houseExpenseExplorerState;
    if (!st) return;

    var flat = window.houseExpenseCategoryFlat || [];
    var row = flat.find(function (r) {
        return Number(r.IDNo) === Number(categoryId);
    });
    if (!row) return;

    var oldName = String(row.CATEGORY || '').trim();
    newName = String(newName || '').trim();
    if (!oldName || !newName || oldName === newName) return;

    var isSub = row.PARENT_ID != null && Number(row.PARENT_ID) > 0;
    if (isSub) {
        if (String(st.subCategory || '').trim() === oldName) {
            st.subCategory = newName;
        }
    } else if (String(st.mainCategory || '').trim() === oldName) {
        st.mainCategory = newName;
    }
}

function syncHouseExpenseExplorerStateAfterCategoryDelete(categoryId) {
    var st = window.houseExpenseExplorerState;
    if (!st) return;

    var flat = window.houseExpenseCategoryFlat || [];
    var row = flat.find(function (r) {
        return Number(r.IDNo) === Number(categoryId);
    });
    if (!row) return;

    var name = String(row.CATEGORY || '').trim();
    var isSub = row.PARENT_ID != null && Number(row.PARENT_ID) > 0;
    if (isSub) {
        if (String(st.subCategory || '').trim() === name) {
            st.subCategory = null;
        }
    } else if (String(st.mainCategory || '').trim() === name) {
        st.mainCategory = null;
        st.subCategory = null;
    }
}

function selectHouseExpenseExplorerAfterCategoryAdd(level, categoryName, parentId) {
    var st = window.houseExpenseExplorerState;
    if (!st) return;

    categoryName = String(categoryName || '').trim();
    if (!categoryName) return;

    if (level === 'sub') {
        if (!st.mainCategory && parentId) {
            var flat = window.houseExpenseCategoryFlat || [];
            var parentRow = flat.find(function (r) {
                return Number(r.IDNo) === Number(parentId);
            });
            if (parentRow) {
                st.mainCategory = String(parentRow.CATEGORY || '').trim();
            } else {
                var parentName = String($('#house-expense-quick-cat-parent-name').text() || '').trim();
                if (parentName) st.mainCategory = parentName;
            }
        }
        st.subCategory = categoryName;
        return;
    }

    st.mainCategory = categoryName;
    st.subCategory = null;
}

function refreshHouseExpenseAfterCategoryCatalogChange(options) {
    options = options && typeof options === 'object' ? options : {};
    expense_category(
        null,
        function () {
            if (typeof window.reloadData === 'function') {
                window.reloadData({ preserveExplorerState: !!options.preserveExplorerState });
            } else if (window.houseExpenseLastRows && $('#expense-main-cat-list').length) {
                refreshHouseExpenseExplorerOnly();
            }
        },
        { skipExplorerRefresh: true }
    );
}

function refreshHouseExpenseAfterMutation() {
    if (typeof window.reloadData === 'function') {
        window.reloadData({ preserveExplorerState: true });
    }
}

function buildHouseExpenseCategoryActionsHtml(categoryId) {
    if (!categoryId || !canManageHouseExpenseCategories()) return '';
    return (
        '<div class="expense-cat-actions">' +
        '<button type="button" class="expense-cat-action-btn expense-cat-action-btn-edit js-house-expense-cat-edit" data-category-id="' +
        attrEncode(String(categoryId)) +
        '" title="Edit" aria-label="Edit category">' +
        '<i class="fa fa-pencil-alt" aria-hidden="true"></i></button>' +
        '<button type="button" class="expense-cat-action-btn expense-cat-action-btn-delete js-house-expense-cat-delete" data-category-id="' +
        attrEncode(String(categoryId)) +
        '" title="Delete" aria-label="Delete category">' +
        '<i class="fa fa-trash-alt" aria-hidden="true"></i></button>' +
        '</div>'
    );
}

function buildHouseExpenseCategoryMetaHtml(count, categoryId) {
    var actions = buildHouseExpenseCategoryActionsHtml(categoryId);
    return (
        '<div class="expense-cat-item-meta' +
        (actions ? ' expense-cat-item-meta--actions' : '') +
        '">' +
        '<span class="expense-cat-count">' +
        count +
        '</span>' +
        actions +
        '</div>'
    );
}

function isHouseExpenseReturnMoneyMain(mainName) {
    return String(mainName || '').trim() === HOUSE_EXPENSE_RETURN_MONEY_LABEL;
}

function sumHouseExpenseReturnMoneyRows(rows) {
    var sum = 0;
    (rows || []).forEach(function (r) {
        if (r && r.record_type === 'return_money') sum += Number(r.AMOUNT) || 0;
    });
    return sum;
}

function countHouseExpenseReturnMoneyRows(rows) {
    var count = 0;
    (rows || []).forEach(function (r) {
        if (r && r.record_type === 'return_money') count += 1;
    });
    return count;
}

function syncHouseExpenseCategoryAddButtons() {
    var $mainBtn = $('#btn-house-expense-add-main-cat');
    var $subBtn = $('#btn-house-expense-add-sub-cat');
    var $returnBtn = $('#btn-house-expense-return-money');
    var $newExpenseBtn = $('#btn-house-expense-new-expense');
    if (!$mainBtn.length && !$subBtn.length && !$returnBtn.length && !$newExpenseBtn.length) return;

    var isViewOnly =
        window.PermissionViewOnly &&
        window.PermissionViewOnly.isViewOnly &&
        window.PermissionViewOnly.isViewOnly();
    var canAddCategory =
        window.PermissionViewOnly &&
        window.PermissionViewOnly.isExpenseHandler &&
        window.PermissionViewOnly.isExpenseHandler();
    var st = window.houseExpenseExplorerState || {};
    var hasMain = !!(st.mainCategory && getHouseExpenseMainCategoryIdByName(st.mainCategory));
    var showNewExpense = !!(st.mainCategory && !isHouseExpenseReturnMoneyMain(st.mainCategory));

    if ($mainBtn.length) {
        $mainBtn.toggleClass('d-none', !canAddCategory);
        $mainBtn.prop('disabled', !canAddCategory || !!isViewOnly);
        $mainBtn.toggleClass('is-disabled', !canAddCategory || !!isViewOnly);
    }
    if ($subBtn.length) {
        $subBtn.toggleClass('d-none', !canAddCategory);
        $subBtn.prop('disabled', !canAddCategory || !!isViewOnly || !hasMain);
        $subBtn.toggleClass('is-disabled', !canAddCategory || !!isViewOnly || !hasMain);
    }
    if ($returnBtn.length) {
        var showReturnMoney = isHouseExpenseReturnMoneyMain(st.mainCategory);
        $returnBtn.toggleClass('d-none', !showReturnMoney);
        $returnBtn.prop('disabled', !!isViewOnly);
    }
    if ($newExpenseBtn.length) {
        $newExpenseBtn.toggleClass('d-none', !showNewExpense);
        $newExpenseBtn.prop('disabled', !!isViewOnly);
    }
}

function openHouseExpenseQuickCategoryModal(level) {
    var st = window.houseExpenseExplorerState || {};
    var $modal = $('#modal-house-expense-quick-category');
    if (!$modal.length) return;

    var $title = $('#modal-house-expense-quick-category-title');
    var $level = $('#house-expense-quick-cat-level');
    var $parentId = $('#house-expense-quick-cat-parent-id');
    var $parentWrap = $('#house-expense-quick-cat-parent-wrap');
    var $parentName = $('#house-expense-quick-cat-parent-name');
    var $name = $('#house-expense-quick-cat-name');
    var $editId = $('#house-expense-quick-cat-id');

    $name.val('').removeClass('is-invalid');
    if ($editId.length) $editId.val('');

    if (level === 'sub') {
        var mainId = getHouseExpenseMainCategoryIdByName(st.mainCategory);
        if (!mainId) {
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    icon: 'info',
                    title: 'Select main category',
                    text: 'Please select a main category first.'
                });
            }
            return;
        }
        $level.val('sub');
        $parentId.val(String(mainId));
        $parentName.text(st.mainCategory);
        $parentWrap.removeClass('d-none');
        $title.text('Add Sub Category');
    } else {
        $level.val('main');
        $parentId.val('');
        $parentWrap.addClass('d-none');
        $title.text('Add Main Category');
    }

    showBootstrapModal($modal);
    setTimeout(function () {
        $name.trigger('focus');
    }, 300);
}

function openHouseExpenseEditCategoryModal(categoryId) {
    if (!canManageHouseExpenseCategories() || !categoryId) return;

    var flat = window.houseExpenseCategoryFlat || [];
    var row = flat.find(function (r) {
        return Number(r.IDNo) === Number(categoryId);
    });
    if (!row) return;

    var $modal = $('#modal-house-expense-quick-category');
    if (!$modal.length) return;

    var isSub = row.PARENT_ID != null && Number(row.PARENT_ID) > 0;
    var $title = $('#modal-house-expense-quick-category-title');
    var $level = $('#house-expense-quick-cat-level');
    var $parentId = $('#house-expense-quick-cat-parent-id');
    var $parentWrap = $('#house-expense-quick-cat-parent-wrap');
    var $parentName = $('#house-expense-quick-cat-parent-name');
    var $name = $('#house-expense-quick-cat-name');
    var $editId = $('#house-expense-quick-cat-id');

    if ($editId.length) $editId.val(String(categoryId));
    $level.val(isSub ? 'sub' : 'main');
    $name.val(row.CATEGORY || '').removeClass('is-invalid');

    if (isSub) {
        var parentRow = flat.find(function (r) {
            return Number(r.IDNo) === Number(row.PARENT_ID);
        });
        $parentId.val(String(row.PARENT_ID));
        $parentName.text(parentRow ? parentRow.CATEGORY : '');
        $parentWrap.removeClass('d-none');
        $title.text('Edit Sub Category');
    } else {
        $parentId.val('');
        $parentWrap.addClass('d-none');
        $title.text('Edit Main Category');
    }

    showBootstrapModal($modal);
    setTimeout(function () {
        $name.trigger('focus');
    }, 300);
}

function archiveHouseExpenseCategory(categoryId) {
    if (!canManageHouseExpenseCategories() || !categoryId) return;

    Swal.fire({
        title: 'Are you sure you want to delete this?',
        text: 'Deleting a main category will also archive its sub categories.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Yes'
    }).then(function (result) {
        if (!result.isConfirmed) return;
        $.ajax({
            url: '/expense_category/remove/' + categoryId,
            type: 'PUT',
            success: function () {
                syncHouseExpenseExplorerStateAfterCategoryDelete(categoryId);
                refreshHouseExpenseAfterCategoryCatalogChange({ preserveExplorerState: true });
                if (typeof Swal !== 'undefined') {
                    Swal.fire({
                        icon: 'success',
                        title: 'Category deleted',
                        timer: 1400,
                        showConfirmButton: false
                    });
                }
            },
            error: function (xhr) {
                var msg = xhr.responseText || 'Could not delete category.';
                if (typeof Swal !== 'undefined') {
                    Swal.fire({ icon: 'error', title: 'Error', text: msg });
                }
            }
        });
    });
}

function initHouseExpenseCategoryCatalogFromPage() {
    var catalog = window.houseExpenseCategoryCatalog || [];
    if (!catalog.length) return;
    if (catalog[0] && catalog[0].children) {
        window.houseExpenseCategoryTree = catalog;
        window.houseExpenseCategoryFlat = flattenHouseExpenseCategoryTree(catalog);
    } else if (catalog[0] && catalog[0].IDNo) {
        cacheHouseExpenseCategoryData(catalog);
    }
}

function populateHouseExpenseMainCategorySelect($select, selectedMainId) {
    if (!$select || !$select.length) return;
    $select.empty();
    $select.append($('<option>', { value: '', text: '' }));
    getHouseExpenseCategoryTree().forEach(function (main) {
        $select.append(
            $('<option>', {
                value: main.IDNo,
                text: main.CATEGORY,
                selected: selectedMainId != null && Number(selectedMainId) === Number(main.IDNo)
            })
        );
    });
}

function refreshHouseExpenseSubCategorySelect(mainId, selectedSubId, $subSelect, $wrap) {
    if (!$subSelect || !$subSelect.length) return;
    var tree = getHouseExpenseCategoryTree();
    var main = tree.find(function (m) {
        return Number(m.IDNo) === Number(mainId);
    });
    var subs = main && main.children ? main.children : [];
    $subSelect.empty();
    $subSelect.append($('<option>', { value: '', text: '' }));
    if (!mainId || subs.length === 0) {
        if ($wrap && $wrap.length) $wrap.addClass('d-none');
        $subSelect.prop('required', false);
        return;
    }
    if ($wrap && $wrap.length) $wrap.removeClass('d-none');
    $subSelect.prop('required', true);
    subs.forEach(function (sub) {
        $subSelect.append(
            $('<option>', {
                value: sub.IDNo,
                text: sub.CATEGORY,
                selected: selectedSubId != null && Number(selectedSubId) === Number(sub.IDNo)
            })
        );
    });
}

function resolveHouseExpenseCategoryId(mainId, subId) {
    if (!mainId) return '';
    var tree = getHouseExpenseCategoryTree();
    var main = tree.find(function (m) {
        return Number(m.IDNo) === Number(mainId);
    });
    if (!main) return '';
    if (main.children && main.children.length) {
        return subId || '';
    }
    return String(mainId);
}

function syncHouseExpenseCategoryHiddenField(mainSelector, subSelector, hiddenSelector) {
    var mainId = $(mainSelector).val();
    var subId = $(subSelector).val();
    var resolved = resolveHouseExpenseCategoryId(mainId, subId);
    $(hiddenSelector).val(resolved);
    return resolved;
}

function applyHouseExpenseExplorerToNewExpenseForm() {
    var st = window.houseExpenseExplorerState || {};
    if (!st.mainCategory || isHouseExpenseReturnMoneyMain(st.mainCategory)) return;

    var mainId = getHouseExpenseMainCategoryIdByName(st.mainCategory);
    if (!mainId) return;

    var $mainSelect = $('#expense-main-category-select');
    var $subSelect = $('#expense-sub-category-select');
    var selectedSubId = null;

    if (st.subCategory) {
        var tree = getHouseExpenseCategoryTree();
        var mainNode = tree.find(function (m) {
            return Number(m.IDNo) === Number(mainId);
        });
        if (mainNode && mainNode.children) {
            var subNode = mainNode.children.find(function (s) {
                return String(s.CATEGORY || '').trim() === String(st.subCategory).trim();
            });
            if (subNode) selectedSubId = subNode.IDNo;
        }
    }

    $mainSelect.val(String(mainId));
    refreshHouseExpenseSubCategorySelect(mainId, selectedSubId, $subSelect, $('#house-expense-sub-category-wrap'));
    if (selectedSubId) {
        $subSelect.val(String(selectedSubId));
    }

    syncHouseExpenseCategoryHiddenField(
        '#expense-main-category-select',
        '#expense-sub-category-select',
        '#house-expense-category-id'
    );
}

function getHouseExpenseFilterMode() {
    return $('input[name="filter-mode"]:checked').val() || 'settlement';
}

function houseExpenseEscapeRegex(s) {
    return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getHouseExpenseGrandDateLabel() {
    var mode = getHouseExpenseFilterMode();
    if (mode === 'settlement') {
        return $('#settlement-date-picker').val() || '—';
    }
    var el = document.getElementById('daterange-picker');
    if (el && el._flatpickr && el._flatpickr.selectedDates && el._flatpickr.selectedDates.length === 2) {
        var a = el._flatpickr.selectedDates[0];
        var b = el._flatpickr.selectedDates[1];
        return moment(a).format('MMM D, YYYY') + ' – ' + moment(b).format('MMM D, YYYY');
    }
    return 'Select date range';
}

function houseExpenseSumExpenseRows(rows, predicate) {
    var sum = 0;
    (rows || []).forEach(function (row) {
        if (!row || row.record_type === 'return_money') return;
        if (predicate && !predicate(row)) return;
        sum += Number(row.AMOUNT) || 0;
    });
    return sum;
}

function disposeHouseExpenseTooltip(el) {
    if (typeof bootstrap === 'undefined' || !bootstrap.Tooltip) return;
    var existing = bootstrap.Tooltip.getInstance(el);
    if (existing) {
        existing.dispose();
    }
    $(el).removeAttr('title data-bs-toggle data-bs-placement data-bs-custom-class');
}

function bindHouseExpenseTooltip(el, text, onlyIfTruncated) {
    if (typeof bootstrap === 'undefined' || !bootstrap.Tooltip) return;
    disposeHouseExpenseTooltip(el);
    if (!text) return;
    if (onlyIfTruncated && el.scrollWidth <= el.clientWidth) return;

    $(el).attr({
        'data-bs-toggle': 'tooltip',
        'data-bs-placement': 'top',
        'data-bs-custom-class': 'house-expense-cell-tooltip',
        title: text
    });

    new bootstrap.Tooltip(el, {
        customClass: 'house-expense-cell-tooltip',
        container: 'body',
        trigger: 'hover focus'
    });
}

function initHouseExpenseCellTooltips() {
    $('#expense-tbl tbody td.house-expense-cell-tip').each(function () {
        var el = this;
        var text = ($(el).attr('data-full-text') || $(el).text() || '').trim();
        bindHouseExpenseTooltip(el, text, true);
    });

    $('#expense-tbl thead th.house-expense-header-tip').each(function () {
        var el = this;
        var text = ($(el).attr('data-full-text') || $(el).text() || '').replace(/\s+/g, ' ').trim();
        bindHouseExpenseTooltip(el, text, true);
    });
}

function applyHouseExpenseExplorerDataTableFilter() {
    if (!$.fn.DataTable.isDataTable('#expense-tbl')) return;
    var dt = $('#expense-tbl').DataTable();
    var st = window.houseExpenseExplorerState || {};
    var pattern = '';
    if (st.subCategory && st.mainCategory) {
        pattern =
            '^' +
            houseExpenseEscapeRegex(st.mainCategory) +
            ' › ' +
            houseExpenseEscapeRegex(st.subCategory) +
            '$';
    } else if (st.mainCategory) {
        if (isHouseExpenseReturnMoneyMain(st.mainCategory)) {
            pattern = '^' + houseExpenseEscapeRegex(HOUSE_EXPENSE_RETURN_MONEY_LABEL) + '$';
        } else {
            pattern = '^' + houseExpenseEscapeRegex(st.mainCategory) + '( › |$)';
        }
    }
    dt.column(0).search(pattern, true, false);
    dt.draw();
}

function refreshHouseExpenseExplorerOnly() {
    var rows = window.houseExpenseLastRows || [];
    var te = 0;
    var tr = 0;
    rows.forEach(function (r) {
        if (!r) return;
        var a = Number(r.AMOUNT) || 0;
        if (r.record_type === 'return_money') tr += a;
        else te += a;
    });
    refreshHouseExpenseDashboard(rows, te, tr);
}

// Helper: encode string for safe use in HTML data attributes (handles newlines, quotes, etc.)
function attrEncode(str) {
    if (str == null || str === '') return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\r\n|\r|\n/g, '&#10;');
}

function formatHouseExpensePeso(n) {
    var v = Number(n) || 0;
    return '₱' + v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatHouseExpenseNumber(n) {
    var v = Number(n) || 0;
    return v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/** Selected-total KPI line: whole numbers without “.0” (e.g. 100% not 100.0%). */
function formatHouseExpenseKpiPercentOfGrand(pct) {
    if (pct == null || isNaN(pct)) return '—';
    var r = Math.round(pct * 10) / 10;
    if (Math.abs(r - Math.round(r)) < 1e-6) {
        return Math.round(r) + '% of grand total';
    }
    return r.toFixed(1) + '% of grand total';
}

// Eight distinct category colors (no repeat within top 8). Green reserved for Return Money only.
var HOUSE_EXPENSE_ANALYTICS_SOLIDS = [
    { bar: '#3b59ff', text: '#1e3a8a', track: 'rgba(59, 89, 255, 0.14)' },
    { bar: '#f06522', text: '#9a3412', track: 'rgba(240, 101, 34, 0.16)' },
    { bar: '#7c3aed', text: '#4c1d95', track: 'rgba(124, 58, 237, 0.14)' },
    { bar: '#db2777', text: '#831843', track: 'rgba(219, 39, 119, 0.14)' },
    { bar: '#0891b2', text: '#164e63', track: 'rgba(8, 145, 178, 0.14)' },
    { bar: '#ca8a04', text: '#713f12', track: 'rgba(202, 138, 4, 0.15)' },
    { bar: '#4f46e5', text: '#312e81', track: 'rgba(79, 70, 229, 0.14)' },
    { bar: '#b45309', text: '#78350f', track: 'rgba(180, 83, 9, 0.14)' }
];

function houseExpenseAnalyticsSolidAtRow(rowIndex) {
    var i = Math.max(0, parseInt(rowIndex, 10) || 0);
    return HOUSE_EXPENSE_ANALYTICS_SOLIDS[i % HOUSE_EXPENSE_ANALYTICS_SOLIDS.length];
}

function houseExpenseAnalyticsReturnMoneySolid() {
    return {
        bar: '#109d59',
        text: '#065f46',
        track: 'rgba(16, 157, 89, 0.14)'
    };
}

function houseExpenseEditLogCount(row) {
    if (row.record_type === 'return_money') return 0;
    var n = row.EDIT_LOG_COUNT != null ? row.EDIT_LOG_COUNT : row.edit_log_count;
    return parseInt(n, 10) || 0;
}

function houseExpenseHtmlEscape(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Amount line in edit log: show number only (no ₱) in the modal. */
function houseExpenseEditLogValueForDisplay(label, value) {
    if (value == null) return '';
    var v = String(value);
    if (/^amount$/i.test(String(label || '').trim())) {
        v = v.replace(/^\s*\u20B1\s*/, '').trim();
    }
    return v;
}

/** Parses CHANGES_TEXT into rows; drops Edited by/Date lines (shown in card header). */
function houseExpenseRenderEditLogFieldRows(changesText) {
    var lines = String(changesText || '').split(/\r\n|\r|\n/);
    var rows = [];
    for (var i = 0; i < lines.length; i++) {
        var trimmed = lines[i].trim();
        if (!trimmed) continue;
        if (/^edited by\s*:/i.test(trimmed)) continue;
        if (/^date\s*:/i.test(trimmed)) continue;
        var colon = trimmed.indexOf(':');
        if (colon > 0) {
            rows.push({
                label: trimmed.slice(0, colon).trim(),
                value: trimmed.slice(colon + 1).trim()
            });
        } else {
            rows.push({ label: '', value: trimmed });
        }
    }
    if (rows.length === 0) {
        return '<p class="text-muted small mb-0 py-3 px-3">—</p>';
    }
    var out = [];
    for (var j = 0; j < rows.length; j++) {
        var r = rows[j];
        if (r.label) {
            var displayVal = houseExpenseEditLogValueForDisplay(r.label, r.value);
            out.push(
                '<div class="row g-0 house-expense-history-row border-bottom border-light mx-0">' +
                    '<div class="col-12 col-sm-4 py-2 px-3 align-self-start house-expense-history-label">' +
                    houseExpenseHtmlEscape(r.label) +
                    '</div>' +
                    '<div class="col-12 col-sm-8 py-2 px-3 house-expense-history-value">' +
                    houseExpenseHtmlEscape(displayVal) +
                    '</div>' +
                    '</div>'
            );
        } else {
            out.push(
                '<div class="py-2 px-3 small text-secondary border-bottom border-light">' +
                    houseExpenseHtmlEscape(r.value) +
                    '</div>'
            );
        }
    }
    return '<div class="house-expense-history-fields bg-white rounded-bottom">' + out.join('') + '</div>';
}

window.showHouseExpenseEditHistory = function (expenseId) {
    var t = window.houseExpenseTranslations || {};
    var editorLbl = t.edit_history_editor || 'Edited by';
    $.getJSON('/junket_house_expense/' + expenseId + '/edit_log')
        .done(function (entries) {
            var $body = $('#house-expense-edit-history-body');
            if (!entries || entries.length === 0) {
                $body.html(
                    '<div class="text-center py-5 text-muted"><i class="fa fa-inbox fa-2x mb-3 opacity-50"></i><p class="mb-0">' +
                        houseExpenseHtmlEscape(t.edit_history_empty || 'No edit history.') +
                        '</p></div>'
                );
            } else {
                var html = entries
                    .map(function (e) {
                        var dt = e.EDITED_DT != null ? e.EDITED_DT : e.edited_dt;
                        var name =
                            e.edited_by_name != null
                                ? e.edited_by_name
                                : e.EDITED_BY != null
                                  ? 'User ' + e.EDITED_BY
                                  : '—';
                        var text = String(e.CHANGES_TEXT != null ? e.CHANGES_TEXT : e.changes_text || '');
                        var dtStr = dt ? moment(dt).format('DD MMM YYYY, HH:mm') : '—';
                        return (
                            '<div class="house-expense-history-card card border-0 shadow-sm mb-3 bg-white">' +
                                '<div class="house-expense-history-card-head px-3 py-3">' +
                                '<div class="fs-6 fw-semibold text-dark">' +
                                houseExpenseHtmlEscape(dtStr) +
                                '</div>' +
                                '<div class="small text-muted mt-1">' +
                                '<span class="text-secondary">' +
                                houseExpenseHtmlEscape(editorLbl) +
                                '</span>' +
                                ' <span class="mx-1">·</span> ' +
                                '<span class="text-dark fw-medium">' +
                                houseExpenseHtmlEscape(name) +
                                '</span>' +
                                '</div>' +
                                '</div>' +
                                houseExpenseRenderEditLogFieldRows(text) +
                                '</div>'
                        );
                    })
                    .join('');
                $body.html(html);
            }
            var $modal = $('#modal-house-expense-edit-history');
            if ($modal.length) {
                showBootstrapModal($modal);
            }
        })
        .fail(function () {
            if (window.Swal) {
                Swal.fire(t.error || 'Error', t.edit_history_error || 'Could not load edit history.', 'error');
            } else {
                alert(t.edit_history_error || 'Could not load edit history.');
            }
        });
};

/** Updates expense, return money, and net KPI card amounts. */
function setHouseExpenseFooterTotals(totalExpense, totalReturnMoney) {
    var te = Number(totalExpense) || 0;
    var tr = Number(totalReturnMoney) || 0;
    var dateLabel = getHouseExpenseGrandDateLabel();
    $('#expense-kpi-grand-amount').text(formatHouseExpensePeso(te));
    $('#expense-kpi-return-amount').text(formatHouseExpensePeso(tr));
    $('#expense-kpi-net-amount').text(formatHouseExpensePeso(te - tr));
    $('#expense-kpi-grand-range').text(dateLabel);
    $('#expense-kpi-return-range').text(dateLabel);
    $('#expense-kpi-net-range').text(dateLabel);
}

function renderHouseExpenseGraphRaceBarsHtml(entries, opts) {
    opts = opts || {};
    var pctBase = opts.percentBase || 0;
    var clickable = !!opts.clickableCategory;
    if (!entries || entries.length === 0) {
        return '<div class="text-muted small py-2">No breakdown data.</div>';
    }
    return entries
        .map(function (entry, rowIdx) {
            var pal =
                entry.name === HOUSE_EXPENSE_RETURN_MONEY_LABEL
                    ? houseExpenseAnalyticsReturnMoneySolid()
                    : houseExpenseAnalyticsSolidAtRow(rowIdx);
            // Bar width = share of grand total (same as the % label), not vs. largest category
            var shareOfTotal = pctBase > 0 ? (entry.amount / pctBase) * 100 : 0;
            var barPct = Math.min(100, Math.max(0, shareOfTotal));
            var shareText = shareOfTotal.toFixed(1) + '%';
            var rowCls = clickable ? 'expense-graph-race-row js-expense-graph-cat-open' : 'expense-graph-race-row';
            var dataCat = clickable ? ' data-category="' + attrEncode(entry.name) + '"' : '';
            return (
                '<div class="' +
                rowCls +
                '"' +
                dataCat +
                '>' +
                '<div class="expense-graph-race-label-cell">' +
                '<span class="expense-graph-race-dot" style="background-color:' +
                pal.bar +
                '"></span>' +
                '<span class="expense-graph-race-label" title="' +
                attrEncode(entry.name) +
                '">' +
                houseExpenseHtmlEscape(entry.name) +
                '</span>' +
                '</div>' +
                '<div class="expense-graph-race-bar-cell">' +
                '<div class="expense-graph-race-track" style="background:' +
                pal.track +
                '">' +
                '<div class="expense-graph-race-fill" style="width:' +
                barPct.toFixed(2) +
                '%;background:' +
                pal.bar +
                ';"></div>' +
                '</div>' +
                '</div>' +
                '<div class="expense-graph-race-value-cell">' +
                '<span class="expense-graph-race-peso">' +
                formatHouseExpensePeso(entry.amount) +
                '</span>' +
                '<span class="expense-graph-race-pct" style="color:' +
                pal.bar +
                '">(' +
                shareText +
                ')</span>' +
                '</div>' +
                '</div>'
            );
        })
        .join('');
}

function renderHouseExpenseGraphRaceBodyFromState(data, totalExpense, totalReturnMoney) {
    var $body = $('#expense-graph-race-body');
    var $sub = $('#expense-graph-subtitle');
    if (!$body.length) return;

    var te = Number(totalExpense) || 0;
    var tr = Number(totalReturnMoney) || 0;
    var expenseRows = (data || []).filter(function (row) {
        return row && row.record_type !== 'return_money';
    });
    var returnMoneyCount = countHouseExpenseReturnMoneyRows(data);

    if (expenseRows.length === 0 && returnMoneyCount === 0) {
        if ($sub.length) $sub.text('By category');
        $body.html('<div class="text-muted small py-2">No expense data yet.</div>');
        return;
    }

    if ($sub.length) $sub.text('By category');

    var byCategory = {};
    expenseRows.forEach(function (row) {
        var amount = Number(row.AMOUNT) || 0;
        var category = row.expense_main_category || row.expense_category || 'Uncategorized';
        byCategory[category] = (byCategory[category] || 0) + amount;
    });
    if (returnMoneyCount > 0) {
        byCategory[HOUSE_EXPENSE_RETURN_MONEY_LABEL] = tr;
    }
    var categoryEntries = Object.keys(byCategory)
        .map(function (key) {
            return { name: key, amount: byCategory[key] };
        })
        .sort(function (a, b) {
            return b.amount - a.amount;
        })
        .slice(0, 8);

    var percentageBase = te + tr > 0 ? te + tr : 0;
    var mainHtml = renderHouseExpenseGraphRaceBarsHtml(categoryEntries, {
        percentBase: percentageBase,
        clickableCategory: true
    });
    $body.html(mainHtml);
}

function renderHouseExpenseCategoryLists(data) {
    var st = window.houseExpenseExplorerState || {};
    var allRows = (data || []).filter(function (r) {
        return r;
    });
    var expenseRows = allRows.filter(function (r) {
        return r.record_type !== 'return_money';
    });
    var returnMoneyCount = countHouseExpenseReturnMoneyRows(allRows);

    var byMain = {};
    var bySub = {};
    expenseRows.forEach(function (r) {
        var main = String(r.expense_main_category || r.expense_category || 'Uncategorized').trim() || 'Uncategorized';
        var sub = r.expense_sub_category != null ? String(r.expense_sub_category).trim() : '';
        if (!byMain[main]) byMain[main] = { count: 0, sum: 0 };
        byMain[main].count += 1;
        byMain[main].sum += Number(r.AMOUNT) || 0;
        if (sub) {
            var subKey = main + '\u0000' + sub;
            if (!bySub[subKey]) bySub[subKey] = { count: 0, sum: 0, main: main, sub: sub };
            bySub[subKey].count += 1;
            bySub[subKey].sum += Number(r.AMOUNT) || 0;
        }
    });
    byMain[HOUSE_EXPENSE_RETURN_MONEY_LABEL] = {
        count: returnMoneyCount,
        sum: sumHouseExpenseReturnMoneyRows(allRows)
    };

    var tree = getHouseExpenseCategoryTree();
    var mainHtml = [];
    mainHtml.push(
        '<div class="expense-cat-item js-expense-main-cat' +
            (!st.mainCategory && !st.subCategory ? ' is-active' : '') +
            '" data-main="">' +
            '<span class="expense-cat-name">All categories</span>' +
            '<span class="expense-cat-count">' +
            allRows.length +
            '</span>' +
            '</div>'
    );

    function pushMainCategoryItem(mainName, count, categoryId) {
        var id = categoryId != null ? categoryId : getHouseExpenseMainCategoryIdByName(mainName);
        var actionsHtml = buildHouseExpenseCategoryActionsHtml(id);
        var activeMain = st.mainCategory === mainName ? ' is-active' : '';
        mainHtml.push(
            '<div class="expense-cat-item js-expense-main-cat' +
                activeMain +
                (actionsHtml ? ' expense-cat-item--has-actions' : '') +
                '" data-main="' +
                attrEncode(mainName) +
                '" data-category-id="' +
                attrEncode(id || '') +
                '">' +
                '<span class="expense-cat-name" title="' +
                attrEncode(mainName) +
                '">' +
                houseExpenseHtmlEscape(mainName) +
                '</span>' +
                buildHouseExpenseCategoryMetaHtml(count, id) +
                '</div>'
        );
    }

    if (tree.length === 0) {
        Object.keys(byMain)
            .filter(function (name) {
                return name !== HOUSE_EXPENSE_RETURN_MONEY_LABEL;
            })
            .sort(function (a, b) {
                return (byMain[b].sum || 0) - (byMain[a].sum || 0);
            })
            .forEach(function (mainName) {
                var row = byMain[mainName];
                pushMainCategoryItem(mainName, row ? row.count : 0);
            });
    } else {
        tree.forEach(function (main) {
            var mainName = String(main.CATEGORY || '').trim();
            var row = byMain[mainName];
            pushMainCategoryItem(mainName, row ? row.count : 0, main.IDNo);
        });
    }

    pushMainCategoryItem(HOUSE_EXPENSE_RETURN_MONEY_LABEL, returnMoneyCount);

    if (mainHtml.length <= 1 && allRows.length === 0) {
        $('#expense-main-cat-list').html('<div class="text-muted small p-2">No categories</div>');
    } else {
        $('#expense-main-cat-list').html(mainHtml.join(''));
    }

    renderHouseExpenseSubCategoryList(tree, byMain, bySub, st);
    syncHouseExpenseCategoryAddButtons();
}

function renderHouseExpenseSubCategoryList(tree, byMain, bySub, st) {
    st = st || window.houseExpenseExplorerState || {};
    bySub = bySub || {};
    var $subList = $('#expense-sub-cat-list');
    if (!$subList.length) return;

    if (!st.mainCategory) {
        $subList.html('<div class="expense-cat-empty-hint">Select a main category</div>');
        return;
    }

    var mainName = String(st.mainCategory).trim();
    if (isHouseExpenseReturnMoneyMain(mainName)) {
        $subList.html('<div class="expense-cat-empty-hint">No sub categories for this main</div>');
        return;
    }

    var mainTotal = byMain[mainName] ? byMain[mainName].count : 0;
    var mainNode = (tree || []).find(function (m) {
        return String(m.CATEGORY || '').trim() === mainName;
    });
    var subs = mainNode && mainNode.children ? mainNode.children : [];

    if (!subs.length) {
        $subList.html('<div class="expense-cat-empty-hint">No sub categories for this main</div>');
        return;
    }

    var subHtml = [];
    subHtml.push(
        '<div class="expense-cat-item js-expense-sub-cat' +
            (!st.subCategory ? ' is-active' : '') +
            '" data-main="' +
            attrEncode(mainName) +
            '" data-sub="">' +
            '<span class="expense-cat-name">All</span>' +
            '<span class="expense-cat-count">' +
            mainTotal +
            '</span>' +
            '</div>'
    );

    subs.forEach(function (sub) {
        var subName = String(sub.CATEGORY || '').trim();
        var subKey = mainName + '\u0000' + subName;
        var subRow = bySub[subKey];
        var subCnt = subRow ? subRow.count : 0;
        var activeSub = st.subCategory === subName ? ' is-active' : '';
        var actionsHtml = buildHouseExpenseCategoryActionsHtml(sub.IDNo);
        subHtml.push(
            '<div class="expense-cat-item js-expense-sub-cat' +
                activeSub +
                (actionsHtml ? ' expense-cat-item--has-actions' : '') +
                '" data-main="' +
                attrEncode(mainName) +
                '" data-sub="' +
                attrEncode(subName) +
                '" data-category-id="' +
                attrEncode(sub.IDNo || '') +
                '">' +
                '<span class="expense-cat-name" title="' +
                attrEncode(subName) +
                '">' +
                houseExpenseHtmlEscape(subName) +
                '</span>' +
                buildHouseExpenseCategoryMetaHtml(subCnt, sub.IDNo) +
                '</div>'
        );
    });

    $subList.html(subHtml.join(''));
}

function refreshHouseExpenseDashboard(data, totalExpense, totalReturnMoney) {
    var te = Number(totalExpense) || 0;
    var tr = Number(totalReturnMoney) || 0;
    var st = window.houseExpenseExplorerState || {};

    setHouseExpenseFooterTotals(te, tr);

    var selected;
    if (!st.mainCategory && !st.subCategory) {
        selected = te + tr;
    } else if (isHouseExpenseReturnMoneyMain(st.mainCategory)) {
        selected = sumHouseExpenseReturnMoneyRows(data);
    } else {
        selected = houseExpenseSumExpenseRows(data, function (r) {
            var main = String(r.expense_main_category || r.expense_category || '').trim();
            var sub = r.expense_sub_category != null ? String(r.expense_sub_category).trim() : '';
            if (st.subCategory) {
                return main === st.mainCategory && sub === st.subCategory;
            }
            if (st.mainCategory) {
                return main === st.mainCategory;
            }
            return true;
        });
    }

    $('#expense-kpi-selected-amount').text(formatHouseExpensePeso(selected));

    var pctBase;
    if (!st.mainCategory && !st.subCategory) {
        pctBase = te + tr;
    } else if (isHouseExpenseReturnMoneyMain(st.mainCategory)) {
        pctBase = tr;
    } else {
        pctBase = te;
    }
    var pctGrand = pctBase > 0 ? (selected / pctBase) * 100 : null;
    $('#expense-kpi-pct-grand').text(formatHouseExpenseKpiPercentOfGrand(pctGrand));

    renderHouseExpenseCategoryLists(data);
    renderHouseExpenseGraphRaceBodyFromState(data, te, totalReturnMoney);
    applyHouseExpenseExplorerDataTableFilter();
}

function renderHouseExpenseAnalytics(data, totalExpense, totalReturnMoney) {
    refreshHouseExpenseDashboard(data, totalExpense, totalReturnMoney);
}

function toggleHouseExpenseBreakdownPanel() {
    var $g = $('#expense-graph-race-column');
    var $stack = $('#expense-kpi-stack-col');
    var $dash = $('#house-expense-dashboard');
    var $catCol = $('.expense-explorer-side-col');
    var $tableHead = $('.expense-table-panel-head');
    if (!$g.length) return;

    if ($dash.length) $dash.removeClass('d-none');
    $catCol.removeClass('d-none');
    if ($tableHead.length) $tableHead.removeClass('d-none');
    $g.removeClass('d-none').addClass('d-flex align-items-stretch');
    if ($stack.length) {
        $stack.removeClass('col-12').addClass('col-lg-4');
    }
}

function showExpenseBreakdownModalByCategory(categoryName) {
    var category = String(categoryName || '').trim();
    if (!category) return;

    var rows = (window.houseExpenseLastRows || []).filter(function (row) {
        if (!row) return false;
        if (category === HOUSE_EXPENSE_RETURN_MONEY_LABEL) {
            return row.record_type === 'return_money';
        }
        if (row.record_type === 'return_money') return false;
        // Graph aggregates by main category (e.g. "1.Refuel"); rows store full path
        // (e.g. "1.Refuel › Gas") in expense_category — match either field.
        var main = String(row.expense_main_category || '').trim();
        var full = String(row.expense_category || '').trim();
        return main === category || full === category;
    });

    $('#breakdown-modal-category-name').text(category);

    if (rows.length === 0) {
        $('#breakdown-modal-tbody').html('<tr><td colspan="4" class="text-center text-muted py-3">No entries found.</td></tr>');
        $('#breakdown-modal-grand-total').text(formatHouseExpenseNumber(0));
    } else {
        window.houseExpenseBreakdownState.rows = rows.slice();
        window.houseExpenseBreakdownState.sortKey = 'date_time';
        window.houseExpenseBreakdownState.sortDir = 'desc';
        renderExpenseBreakdownModalRows();
    }

    var $breakdownModal = $('#modal-expense-breakdown-details');
    if ($breakdownModal.length) {
        showBootstrapModal($breakdownModal);
    }
}

function getBreakdownSortValue(row, key) {
    if (!row) return '';
    if (key === 'amount') return Number(row.AMOUNT) || 0;
    if (key === 'description') return String(row.RECEIPT_NO || '').toLowerCase();
    if (key === 'in_charge') return String(row.OIC || row.DESCRIPTION || '').toLowerCase();
    if (key === 'date_time') return new Date(row.ENCODED_DT || 0).getTime();
    return '';
}

function renderExpenseBreakdownModalRows() {
    var state = window.houseExpenseBreakdownState || {};
    var rows = (state.rows || []).slice();
    var key = state.sortKey || 'date_time';
    var dir = state.sortDir === 'asc' ? 'asc' : 'desc';

    rows.sort(function (a, b) {
        var av = getBreakdownSortValue(a, key);
        var bv = getBreakdownSortValue(b, key);
        if (av < bv) return dir === 'asc' ? -1 : 1;
        if (av > bv) return dir === 'asc' ? 1 : -1;
        return 0;
    });

    var total = 0;
    var html = rows.map(function (row) {
        var amount = Number(row.AMOUNT) || 0;
        total += amount;
        var displayDate = row.ENCODED_DT
            ? moment.utc(row.ENCODED_DT).utcOffset(8).format('DD MMM YYYY, HH:mm')
            : '-';
        var isReturnMoney = row.record_type === 'return_money';
        var descriptionText = isReturnMoney ? (row.DESCRIPTION || '-') : (row.RECEIPT_NO || '-');
        var inChargeText = isReturnMoney ? '-' : (row.OIC || row.DESCRIPTION || '-');
        return (
            '<tr>' +
                '<td>' + houseExpenseHtmlEscape(descriptionText) + '</td>' +
                '<td>' + houseExpenseHtmlEscape(inChargeText) + '</td>' +
                '<td class="fw-semibold text-end">' + formatHouseExpenseNumber(amount) + '</td>' +
                '<td>' + houseExpenseHtmlEscape(displayDate) + '</td>' +
            '</tr>'
        );
    }).join('');

    $('#breakdown-modal-tbody').html(html || '<tr><td colspan="4" class="text-center text-muted py-3">No entries found.</td></tr>');
    $('#breakdown-modal-grand-total').text(formatHouseExpenseNumber(total));

    $('#breakdown-modal-head-table thead th.sortable-col').each(function () {
        var $th = $(this);
        var thKey = $th.attr('data-sort-key');
        var indicator = '-';
        if (thKey === key) {
            indicator = dir === 'asc' ? '▲' : '▼';
        }
        $th.find('.sort-indicator').text(indicator);
    });
}

$(document).ready(function () {
    mountHouseExpenseModals();

    function clearExpenseTableDisplay() {
        window.houseExpenseExplorerState = { mainCategory: null, subCategory: null };
        if ($.fn.DataTable.isDataTable('#expense-tbl')) {
            var dt = $('#expense-tbl').DataTable();
            dt.clear();
            dt.draw();
        }
        setHouseExpenseFooterTotals(0, 0);
        renderHouseExpenseAnalytics([], 0, 0);
    }

    function initializeExpenseTable() {

        // 1. Initialize DataTable (date range picker removed - using settlement date picker instead)
        if ($.fn.DataTable.isDataTable('#expense-tbl')) {
            $('#expense-tbl').DataTable().destroy();
        }

        const goodsTypeLabel = window.houseExpenseTranslations?.type_goods || 'Goods / Consumables';
        const nonGoodsTypeLabel = window.houseExpenseTranslations?.type_non_goods || 'Non-goods / Services';
        var dataTable = $('#expense-tbl').DataTable({
            "dom": '<"house-expense-dt-toolbar d-flex flex-wrap align-items-end justify-content-between gap-3 mb-2"<"flex-shrink-0 align-self-end"l><"flex-shrink-0 align-self-end ms-md-auto house-expense-dt-search"f>>' +
                'r<"house-expense-table-scroll-wrap"t><"row mt-2"<"col-12 d-flex justify-content-end"p>>',
            "autoWidth": false,
            "order": [[4, 'desc']],
            "pageLength": 15,
            "lengthMenu": [[15, 25, 50, 100, -1], [15, 25, 50, 100, "All"]],
            "columnDefs": [
                {
                    "targets": 0,
                    "width": "24%"
                },
                {
                    "targets": 1,
                    "width": "38%"
                },
                {
                    "targets": 2,
                    "width": "11%"
                },
                {
                    "targets": 3,
                    "width": "9%"
                },
                {
                    "targets": [0, 1, 2],
                    "createdCell": function (cell, cellData) {
                        if (!cellData) return;
                        var text = $('<div>').html(cellData).text().trim();
                        if (text) {
                            $(cell).addClass('house-expense-cell-tip').attr('data-full-text', text);
                        }
                    }
                },
                {
                    "targets": 4,
                    "width": "18%",
                    "render": function (data, type, row) {
                        // Check if this is a "no data" row - return empty string
                        if (!data || data === '' || (row && Array.isArray(row) && row.length > 0 && (row[0] === (window.houseExpenseTranslations?.no_data_found || 'No data found')))) {
                            return '';
                        }
                        if (type === 'sort') {
                            if (!data) return '';
                            return moment.utc(data, 'MMMM DD, YYYY HH:mm:ss').format('YYYY-MM-DD HH:mm:ss');
                        }
                        if (!data) return '';
                        const dateMoment = moment(data, 'MMMM DD, YYYY HH:mm:ss');
                        return dateMoment.isValid() ? dateMoment.local().format('DD MMM, YYYY HH:mm') : '';
                    }
                },
                {
                    "targets": 5,
                    "width": "168px",
                    "orderable": false
                }
            ],
            "drawCallback": function () {
                initHouseExpenseCellTooltips();
            },
            "info": false,
            "language": {
                "search": (window.houseExpenseTranslations?.search || "Search:"),
                "paginate": {
                    "previous": (window.houseExpenseTranslations?.previous || "Previous"),
                    "next": (window.houseExpenseTranslations?.next || "Next")
                },
                "emptyTable": (window.houseExpenseTranslations?.no_data_found || "No data found")
            }
        });

        initHouseExpenseCellTooltips();
        $(window).off('resize.houseExpenseTooltips').on('resize.houseExpenseTooltips', function () {
            clearTimeout(window._houseExpenseTooltipResizeTimer);
            window._houseExpenseTooltipResizeTimer = setTimeout(initHouseExpenseCellTooltips, 150);
        });

        // 2. reloadData function - Supports both settlement date and date range modes
        function reloadData(options) {
            options = options && typeof options === 'object' ? options : {};
            var preserveExplorerState = !!options.preserveExplorerState;
            var filterMode = $('input[name="filter-mode"]:checked').val() || 'settlement';
            var requestData = {};
            var requestMode = filterMode;
            
            if (filterMode === 'settlement') {
                // Settlement date mode
                var settlementDate = window.selectedSettlementDate || 'current';
                requestData.date = settlementDate;
            } else {
                // Date range mode
                var dateRangePicker = document.getElementById('daterange-picker');
                var fromDate = null;
                var toDate = null;
                
                if (dateRangePicker && dateRangePicker._flatpickr) {
                    var selectedDates = dateRangePicker._flatpickr.selectedDates;
                    if (selectedDates && selectedDates.length === 2) {
                        var pad = function(n) { return String(n).padStart(2, '0'); };
                        fromDate = selectedDates[0].getFullYear() + '-' + pad(selectedDates[0].getMonth() + 1) + '-' + pad(selectedDates[0].getDate());
                        toDate = selectedDates[1].getFullYear() + '-' + pad(selectedDates[1].getMonth() + 1) + '-' + pad(selectedDates[1].getDate());
                    }
                }
                
                if (!fromDate || !toDate) {
                    clearExpenseTableDisplay();
                    return;
                }
                
                requestData.fromDate = fromDate;
                requestData.toDate = toDate;
            }
            
            $.ajax({
                url: '/junket_house_expense_data',
                method: 'GET',
                data: requestData,
                success: function (data) {
                    var currentMode = $('input[name="filter-mode"]:checked').val() || 'settlement';
                    if (currentMode !== requestMode) {
                        // Ignore stale response from previous mode
                        return;
                    }
                    if (!preserveExplorerState) {
                        window.houseExpenseExplorerState = { mainCategory: null, subCategory: null };
                    }
                    dataTable.clear();
                    var total_expense = 0;
                    var total_return_money = 0;

                    if (data.length === 0) {
                        // Add centered "No data found" message
                        const noDataText = window.houseExpenseTranslations?.no_data_found || 'No data found';
                        var tbody = dataTable.table().body();
                        $(tbody).html('<tr><td colspan="6" class="text-center" style="padding: 20px;">' + noDataText + '</td></tr>');
                        setHouseExpenseFooterTotals(0, 0);
                        renderHouseExpenseAnalytics([], 0, 0);
                        window.houseExpenseLastRows = [];
                        return;
                    }

                    data.forEach(function (row) {
                        const amount = parseFloat(row.AMOUNT) || 0; // 🛡️ Ensure valid number
                        
                        // Calculate totals separately
                        if (row.record_type === 'return_money') {
                            total_return_money += amount;
                        } else {
                            total_expense += amount;
                        }
                    
                        const permissions = parseInt($('#user-role').data('permissions'));
                        const logCount = houseExpenseEditLogCount(row);
                        const histTitle =
                            (window.houseExpenseTranslations && window.houseExpenseTranslations.edit_history) ||
                            'Edit history';
                        const historyBtnHtml =
                            logCount > 0
                                ? '<button type="button" class="btn btn-sm btn-alt-secondary" onclick="showHouseExpenseEditHistory(' +
                                  row.expense_id +
                                  ')" data-bs-toggle="tooltip" data-bs-placement="top" title="' +
                                  String(histTitle).replace(/"/g, '&quot;') +
                                  '"><i class="fa fa-history"></i></button>'
                                : '';
                        const editBtnClass =
                            logCount > 0 ? 'btn btn-sm btn-alt-success btn-edit-row' : 'btn btn-sm btn-alt-secondary btn-edit-row';
                        const editBtnClassReadonly =
                            logCount > 0 ? 'btn btn-sm btn-alt-success' : 'btn btn-sm btn-alt-secondary';
                        let btn = '';
                        const isViewOnly = window.PermissionViewOnly && window.PermissionViewOnly.isViewOnly();
                        if (!isViewOnly) {
                            btn = `
                                <div class="house-expense-actions">
                                    <button type="button" class="btn btn-sm btn-alt-secondary"
                                            onclick="viewReceipt('${row.photoUrl}')"
                                            ${row.record_type === 'return_money' ? 'disabled' : ''}
                                            data-bs-toggle="tooltip" data-bs-placement="top" title="${window.houseExpenseTranslations?.view_receipt || 'View Receipt'}">
                                        <i class="fa fa-eye"></i>
                                    </button>
                                    <button type="button" class="${editBtnClass}"
                                            data-record-type="${row.record_type || 'expense'}"
                                            data-expense-id="${row.expense_id}"
                                            data-category-id="${attrEncode(row.expense_category_id || '')}"
                                            data-receipt-no="${attrEncode(row.RECEIPT_NO || '')}"
                                            data-date-time="${attrEncode(row.DATE_TIME || row.ENCODED_DT || '')}"
                                            data-description="${attrEncode(row.DESCRIPTION || '')}"
                                            data-amount="${amount}"
                                            data-oic="${attrEncode(row.OIC || '')}"
                                            data-bs-toggle="tooltip" data-bs-placement="top" title="${window.houseExpenseTranslations?.edit_expense || 'Edit Expense'}">
                                        <i class="fa fa-pencil-alt"></i>
                                    </button>
                                    ${historyBtnHtml}
                                    <button type="button" class="btn btn-sm btn-alt-secondary"
                                            onclick="downloadReceipt('${row.photoUrl}')"
                                            ${row.record_type === 'return_money' ? 'disabled' : ''}
                                            data-bs-toggle="tooltip" data-bs-placement="top" title="${window.houseExpenseTranslations?.download_receipt || 'Download Receipt'}">
                                        <i class="fa fa-download"></i>
                                    </button>
                                    <button type="button" class="btn btn-sm btn-alt-secondary"
                                            onclick="${row.record_type === 'return_money' ? `archive_return_money(${row.expense_id})` : `archive_expense(${row.expense_id})`}"
                                            data-bs-toggle="tooltip" data-bs-placement="top" title="${window.houseExpenseTranslations?.archive_expense || 'Archive Expense'}">
                                        <i class="fa fa-trash-alt"></i>
                                    </button>
                                </div>`;
                        } else {
                            btn = `
                                <div class="house-expense-actions">
                                    <button type="button" class="btn btn-sm btn-primary"
                                            onclick="viewReceipt('${row.photoUrl}')"
                                            ${row.record_type === 'return_money' ? 'disabled' : ''}
                                            data-bs-toggle="tooltip" data-bs-placement="top" title="${window.houseExpenseTranslations?.view_receipt || 'View Receipt'}">
                                        <i class="fa fa-eye"></i>
                                    </button>
                                    <button type="button" class="${editBtnClassReadonly}" disabled
                                            data-bs-toggle="tooltip" data-bs-placement="top" title="${window.houseExpenseTranslations?.edit_expense || 'Edit Expense'}">
                                        <i class="fa fa-pencil-alt"></i>
                                    </button>
                                    ${historyBtnHtml}
                                    <button type="button" class="btn btn-sm btn-secondary"
                                            onclick="downloadReceipt('${row.photoUrl}')"
                                            ${row.record_type === 'return_money' ? 'disabled' : ''}
                                            data-bs-toggle="tooltip" data-bs-placement="top" title="${window.houseExpenseTranslations?.download_receipt || 'Download Receipt'}">
                                        <i class="fa fa-download"></i>
                                    </button>
                                    <button type="button" class="btn btn-sm btn-alt-secondary" disabled
                                            data-bs-toggle="tooltip" data-bs-placement="top" title="${window.houseExpenseTranslations?.archive_expense || 'Archive Expense'}">
                                        <i class="fa fa-trash-alt"></i>
                                    </button>
                                </div>`;
                        }
                    
                    const formattedDate = moment.utc(row.ENCODED_DT).utcOffset(8).format('MMMM DD, YYYY HH:mm:ss');
                    
                    // For return money records, show "-" for Type, otherwise use expense_type
                    let expenseTypeLabel = '-';
                    if (row.record_type !== 'return_money') {
                        const typeValue = parseInt(row.expense_type, 10);
                        expenseTypeLabel = (typeValue === 2)
                            ? nonGoodsTypeLabel
                            : goodsTypeLabel;
                    }
                    
                    // Format amount - green color for return money records
                    const formattedAmount = amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
                    const amountDisplay = row.record_type === 'return_money' 
                        ? `<span style="color: green;">${formattedAmount}</span>`
                        : formattedAmount;
                    
                    // For Return Money: description goes in second column (DESCRIPTION); RECEIPT NO column shows '-'
                    dataTable.row.add([
                        row.expense_category || 'N/A',
                        // expenseTypeLabel, // Type column hidden per request
                        row.record_type === 'return_money' ? (row.DESCRIPTION || '-') : (row.RECEIPT_NO || '-'),
                        row.record_type === 'return_money' ? '-' : (row.DESCRIPTION || '-'),
                        amountDisplay,
                        formattedDate,
                        btn
                    ]).draw();
                    });

                    setHouseExpenseFooterTotals(total_expense, total_return_money);
                    renderHouseExpenseAnalytics(data, total_expense, total_return_money);
                    window.houseExpenseLastRows = data;

                },
                error: function (xhr, status, error) {
                    // Error fetching data
                }
            });
        }

        // Expose reloadData if needed
        window.reloadData = reloadData;
        
        // Don't load data here - wait for settlement initialization
    }

    // 3. Initialize DataTable
    initHouseExpenseCategoryCatalogFromPage();
    syncHouseExpenseCategoryAddButtons();
    initializeExpenseTable();

    // ======================= EXPENSE SETTLEMENT FUNCTIONALITY ==================
    
    // Filter mode toggle handler
    $('input[name="filter-mode"]').on('change', function() {
        var mode = $(this).val();
        if (mode === 'settlement') {
            $('#settlement-date-wrapper').show();
            $('#daterange-wrapper').hide();
            toggleHouseExpenseBreakdownPanel();
            if (typeof window.reloadData === 'function') {
                window.reloadData();
            }
        } else {
            $('#settlement-date-wrapper').hide();
            $('#daterange-wrapper').show();
            var daterangePickerEl = document.getElementById('daterange-picker');
            if (daterangePickerEl && daterangePickerEl._flatpickr) {
                daterangePickerEl._flatpickr.clear();
            }
            clearExpenseTableDisplay();
            toggleHouseExpenseBreakdownPanel();
        }
    });

    // Initial visibility based on default selected mode.
    toggleHouseExpenseBreakdownPanel();
    
    // Initialize date range picker (single input with range mode)
    var dateRangePicker = null;
    if (document.getElementById('daterange-picker')) {
        var now = new Date();
        var pad = function(n) { return String(n).padStart(2, '0'); };
        
        var wrapper = document.querySelector('#settlement-date-wrapper .input-group');
        var settledDates = [];
        if (wrapper) {
            var settledDatesRaw = wrapper.getAttribute('data-settled-dates');
            try {
                var parsedDates = settledDatesRaw ? JSON.parse(settledDatesRaw) : [];
                // Make sure window.settledDatesForMonth is set if not already set
                if (!window.settledDatesForMonth || window.settledDatesForMonth.length === 0) {
                    window.settledDatesForMonth = parsedDates;
                }
                settledDates = window.settledDatesForMonth || parsedDates;
            } catch (e) {
                // Error parsing settled dates
            }
        }
        
        // Get earliest settlement date (start of settlement period)
        var earliestSettlementDate = null;
        if (settledDates.length > 0) {
            var sortedDates = settledDates.slice().sort();
            earliestSettlementDate = sortedDates[0];
        } else {
            // If no settled dates, allow navigation back to January 1 of previous year
            var earliestAllowed = new Date(now.getFullYear() - 1, 0, 1);
            earliestSettlementDate = earliestAllowed.getFullYear() + '-' + pad(earliestAllowed.getMonth() + 1) + '-' + pad(earliestAllowed.getDate());
        }
        
        // Date range is independent of "next settlement" cap: max selectable end date is calendar today
        // (same as data-today on the settlement wrapper). Settlement mode still uses data-max-settlement-date.
        var rangeMaxDate =
            (wrapper && wrapper.getAttribute('data-today')) ||
            now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());

        var dateRangeVisibleStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);

        dateRangePicker = flatpickr("#daterange-picker", {
            mode: 'range',
            dateFormat: 'Y-m-d',
            altInput: true,
            altFormat: 'M d, Y',
            showMonths: 3,
            defaultMonth: dateRangeVisibleStart,
            defaultDate: [],
            // maxDate: rangeMaxDate,
            onReady: function (selectedDates, dateStr, instance) {
                if (typeof bindFlatpickrMonthNameRangeSelect === 'function') {
                    bindFlatpickrMonthNameRangeSelect(instance);
                }
            },
            onOpen: function (selectedDates, dateStr, instance) {
                var anchor = new Date();
                instance.jumpToDate(new Date(anchor.getFullYear(), anchor.getMonth() - 2, 1), false);
                if (typeof bindFlatpickrMonthNameRangeSelect === 'function') {
                    bindFlatpickrMonthNameRangeSelect(instance);
                }
            },
            onChange: function(selectedDates, dateStr, instance) {
                if (getHouseExpenseFilterMode() === 'daterange') {
                    toggleHouseExpenseBreakdownPanel();
                    if (selectedDates.length === 2) {
                        if (typeof window.reloadData === 'function') {
                            window.reloadData();
                        }
                    } else {
                        clearExpenseTableDisplay();
                    }
                }
            }
        });
    }
    
    // Initialize settlement date picker
    var settlementDatePicker = null;
    if (document.getElementById('settlement-date-picker')) {
        var wrapper = document.querySelector('#settlement-date-wrapper .input-group');
        if (wrapper) {
            var defaultDate = wrapper.getAttribute('data-default-settlement-date') || new Date().toISOString().slice(0, 10);
            var maxPickerDate = wrapper.getAttribute('data-max-settlement-date') || defaultDate;
            var settledDatesRaw = wrapper.getAttribute('data-settled-dates');
            try {
                window.settledDatesForMonth = settledDatesRaw ? JSON.parse(settledDatesRaw) : [];
            } catch (e) {
                window.settledDatesForMonth = [];
            }
            
            window.selectedSettlementDate = defaultDate;
            
            // Calculate earliest allowed date (January 1 of previous year)
            var now = new Date();
            var pad = function(n) { return String(n).padStart(2, '0'); };
            var earliestAllowed = new Date(now.getFullYear() - 1, 0, 1);
            var earliestSettlementDate = earliestAllowed.getFullYear() + '-' + pad(earliestAllowed.getMonth() + 1) + '-' + pad(earliestAllowed.getDate());
            
            settlementDatePicker = flatpickr("#settlement-date-picker", {
                dateFormat: 'Y-m-d',
                altInput: true,
                altFormat: 'F d, Y',
                defaultDate: defaultDate,
                minDate: earliestSettlementDate,
                maxDate: maxPickerDate,
                allowInput: false,
                onDayCreate: function (dayElem) {
                    if (!dayElem || !dayElem.dateObj) return;
                    var d = dayElem.dateObj;
                    var dStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                    var settledDates = window.settledDatesForMonth || [];
                    if (dStr && settledDates.indexOf(dStr) !== -1) dayElem.classList.add('settled-day');
                },
                onOpen: function (selectedDates, dateStr, instance) {
                    setTimeout(function () {
                        if (!instance.calendarContainer) return;
                        var settledDates = window.settledDatesForMonth || [];
                        var days = instance.calendarContainer.querySelectorAll('.flatpickr-day');
                        days.forEach(function (el) {
                            el.classList.remove('settled-day');
                            if (!el.dateObj) return;
                            var d = el.dateObj;
                            var dStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                            if (dStr && settledDates.indexOf(dStr) !== -1) el.classList.add('settled-day');
                        });
                    }, 0);
                },
                onChange: function (selectedDates, dateStr, instance) {
                    window.selectedSettlementDate = dateStr || '';
                    if (typeof window.updateNavigationButtons === 'function') window.updateNavigationButtons();
                    if (typeof window.updateSettleButtonState === 'function') window.updateSettleButtonState();
                    if (typeof window.reloadData === 'function') window.reloadData();
                },
                onMonthChange: function (selectedDates, dateStr, instance) {
                    setTimeout(function () {
                        if (!instance.calendarContainer) return;
                        var settledDates = window.settledDatesForMonth || [];
                        var days = instance.calendarContainer.querySelectorAll('.flatpickr-day');
                        days.forEach(function (el) {
                            el.classList.remove('settled-day');
                            if (!el.dateObj) return;
                            var d = el.dateObj;
                            var dStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                            if (dStr && settledDates.indexOf(dStr) !== -1) el.classList.add('settled-day');
                        });
                    }, 0);
                }
            });
        }
    }

    // Settlement button state management
    var settleBtnLabel = (window.houseExpenseTranslations && window.houseExpenseTranslations.settle) || 'Settle';
    var settledBtnLabel = (window.houseExpenseTranslations && window.houseExpenseTranslations.settled) || 'Settled';
    
    window.updateSettleButtonState = function (recordCount) {
        // Only update if in settlement mode
        var filterMode = $('input[name="filter-mode"]:checked').val() || 'settlement';
        if (filterMode !== 'settlement') {
            // Hide settle button in date range mode
            $('#btn-daily-settle').addClass('disabled').css('pointer-events', 'none').css('opacity', '0.5');
            return;
        }
        
        var date = window.selectedSettlementDate;
        var todayStr = $('#settlement-date-wrapper .input-group').attr('data-today') || new Date().toISOString().slice(0, 10);
        if (!date) {
            $('#btn-daily-settle').addClass('disabled').text(settleBtnLabel).css('pointer-events', 'none').css('opacity', '0.5');
            return;
        }
        var settled = (window.settledDatesForMonth || []).indexOf(date) !== -1;
        var isPastDate = date < todayStr;
        var noRecordsForPastDate = (recordCount !== undefined && recordCount === 0 && isPastDate);
        var $btn = $('#btn-daily-settle');
        if (settled) {
            $btn.addClass('disabled').text(settledBtnLabel).css('pointer-events', 'none').css('opacity', '0.5');
        } else if (noRecordsForPastDate) {
            $btn.addClass('disabled').text(settleBtnLabel).css('pointer-events', 'none').css('opacity', '0.5');
        } else {
            $btn.removeClass('disabled').text(settleBtnLabel).css('pointer-events', 'auto').css('opacity', '1');
        }
    };

    // Previous/Next Date Navigation Functions
    function getEarliestSettlementDate() {
        // Allow navigation back to January 1 of previous year
        // (no longer restricted by settledDatesForMonth which only contains current month's settled dates)
        var now = new Date();
        var pad = function(n) { return String(n).padStart(2, '0'); };
        var earliestAllowed = new Date(now.getFullYear() - 1, 0, 1);
        return earliestAllowed.getFullYear() + '-' + pad(earliestAllowed.getMonth() + 1) + '-' + pad(earliestAllowed.getDate());
    }
    
    function getPreviousDate(currentDate) {
        if (!currentDate) return null;
        var current = new Date(currentDate + 'T12:00:00');
        var previous = new Date(current);
        previous.setDate(previous.getDate() - 1);
        var pad = function(n) { return String(n).padStart(2, '0'); };
        var previousDateStr = previous.getFullYear() + '-' + pad(previous.getMonth() + 1) + '-' + pad(previous.getDate());
        var earliestSettlementDate = getEarliestSettlementDate();
        if (previousDateStr < earliestSettlementDate) {
            return null;
        }
        return previousDateStr;
    }
    
    function getNextDate(currentDate) {
        if (!currentDate) return null;
        
        var current = new Date(currentDate + 'T12:00:00');
        var next = new Date(current);
        next.setDate(next.getDate() + 1);
        
        var pad = function(n) { return String(n).padStart(2, '0'); };
        var nextDateStr = next.getFullYear() + '-' + pad(next.getMonth() + 1) + '-' + pad(next.getDate());
        
        // Match Game Book: cap at server "next settlement" (data-max-settlement-date), not max(today, default).
        // Otherwise after midnight "today" becomes April 1 while next unsettled day is still March 31 — Next would wrongly allow April 1.
        var wrapper = document.querySelector('#settlement-date-wrapper .input-group');
        var maxAllowedStr = (wrapper && wrapper.getAttribute('data-max-settlement-date')) ||
                            (wrapper && wrapper.getAttribute('data-today')) ||
                            new Date().toISOString().slice(0, 10);
        if (nextDateStr > maxAllowedStr) {
            return null;
        }
        
        return nextDateStr;
    }
    
    // Expose updateNavigationButtons globally so it can be called from flatpickr onChange
    window.updateNavigationButtons = function() {
        var currentDate = window.selectedSettlementDate || $('#settlement-date-wrapper .input-group').attr('data-default-settlement-date');
        var previousDate = getPreviousDate(currentDate);
        var nextDate = getNextDate(currentDate);
        
        // Update previous button state
        if (previousDate) {
            $('#btn-settlement-prev').prop('disabled', false);
        } else {
            $('#btn-settlement-prev').prop('disabled', true);
        }
        
        // Update next button state
        if (nextDate) {
            $('#btn-settlement-next').prop('disabled', false);
        } else {
            $('#btn-settlement-next').prop('disabled', true);
        }
    };
    
    function navigateToDate(targetDate) {
        if (!targetDate) return;
        
        // Update global selected date
        window.selectedSettlementDate = targetDate;
        
        // Update flatpickr date picker
        var pickerEl = document.getElementById('settlement-date-picker');
        if (pickerEl && pickerEl._flatpickr) {
            pickerEl._flatpickr.setDate(targetDate, false);
        }
        
        // Update navigation button states
        updateNavigationButtons();
        
        // Update settle button state
        if (typeof window.updateSettleButtonState === 'function') {
            window.updateSettleButtonState();
        }
        
        // Reload data
        if (typeof window.reloadExpenseBySettlementDate === 'function') {
            window.reloadExpenseBySettlementDate();
        }
    }
    
    // Previous button click handler
    $('#btn-settlement-prev').on('click', function() {
        var currentDate = window.selectedSettlementDate || $('.day-selector-wrapper').attr('data-default-settlement-date');
        var previousDate = getPreviousDate(currentDate);
        
        if (previousDate) {
            navigateToDate(previousDate);
        } else {
            var earliestDate = getEarliestSettlementDate();
            var formattedEarliest = earliestDate ? new Date(earliestDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'earliest settlement date';
            Swal.fire({
                icon: 'info',
                title: 'No Previous Date',
                text: 'You are already at the earliest settlement date (' + formattedEarliest + ').',
                confirmButtonText: 'OK',
                timer: 2000,
                showConfirmButton: false
            });
        }
    });
    
    // Next button click handler
    $('#btn-settlement-next').on('click', function() {
        var currentDate = window.selectedSettlementDate || $('#settlement-date-wrapper .input-group').attr('data-default-settlement-date');
        var nextDate = getNextDate(currentDate);
        
        if (nextDate) {
            navigateToDate(nextDate);
        } else {
            Swal.fire({
                icon: 'info',
                title: 'No Next Date',
                text: 'You are already at the latest available date.',
                confirmButtonText: 'OK',
                timer: 2000,
                showConfirmButton: false
            });
        }
    });

    // Update reloadData to support settlement date
    window.reloadExpenseBySettlementDate = function() {
        var filterMode = $('input[name="filter-mode"]:checked').val() || 'settlement';
        if (filterMode !== 'settlement') {
            clearExpenseTableDisplay();
            return;
        }
        // Get fresh date each time function is called
        var date = window.selectedSettlementDate || 'current';
        $.ajax({
            url: '/junket_house_expense_data',
            method: 'GET',
            data: { date: date },
                    success: function (data) {
                        var currentMode = $('input[name="filter-mode"]:checked').val() || 'settlement';
                        if (currentMode !== 'settlement') {
                            clearExpenseTableDisplay();
                            return;
                        }
                        window.houseExpenseExplorerState = { mainCategory: null, subCategory: null };
                        var dataTable = $('#expense-tbl').DataTable();
                        dataTable.clear();
                        var total_expense = 0;
                        var total_return_money = 0;

                        if (data.length === 0) {
                            const noDataText = window.houseExpenseTranslations?.no_data_found || 'No data found';
                            var tbody = dataTable.table().body();
                            $(tbody).html('<tr><td colspan="6" class="text-center" style="padding: 20px;">' + noDataText + '</td></tr>');
                            setHouseExpenseFooterTotals(0, 0);
                            renderHouseExpenseAnalytics([], 0, 0);
                            window.houseExpenseLastRows = [];
                            if (typeof window.updateSettleButtonState === 'function') {
                                window.updateSettleButtonState(0);
                            }
                            return;
                        }

                        const goodsTypeLabel = window.houseExpenseTranslations?.type_goods || 'Goods / Consumables';
                        const nonGoodsTypeLabel = window.houseExpenseTranslations?.type_non_goods || 'Non-goods / Services';

                        data.forEach(function (row) {
                            const amount = parseFloat(row.AMOUNT) || 0;
                            
                            if (row.record_type === 'return_money') {
                                total_return_money += amount;
                            } else {
                                total_expense += amount;
                            }
                        
                            const permissions = parseInt($('#user-role').data('permissions'));
                            const logCount = houseExpenseEditLogCount(row);
                            const histTitle =
                                (window.houseExpenseTranslations && window.houseExpenseTranslations.edit_history) ||
                                'Edit history';
                            const historyBtnHtml =
                                logCount > 0
                                    ? '<button type="button" class="btn btn-sm btn-alt-secondary" onclick="showHouseExpenseEditHistory(' +
                                      row.expense_id +
                                      ')" data-bs-toggle="tooltip" data-bs-placement="top" title="' +
                                      String(histTitle).replace(/"/g, '&quot;') +
                                      '"><i class="fa fa-history"></i></button>'
                                    : '';
                            const editBtnClass =
                                logCount > 0 ? 'btn btn-sm btn-alt-success btn-edit-row' : 'btn btn-sm btn-alt-secondary btn-edit-row';
                            const editBtnClassReadonly =
                                logCount > 0 ? 'btn btn-sm btn-alt-success' : 'btn btn-sm btn-alt-secondary';
                            let btn = '';
                            const isViewOnly = window.PermissionViewOnly && window.PermissionViewOnly.isViewOnly();
                            if (!isViewOnly) {
                                btn = `
                                    <div class="house-expense-actions">
                                        <button type="button" class="btn btn-sm btn-alt-secondary"
                                                onclick="viewReceipt('${row.photoUrl}')"
                                                ${row.record_type === 'return_money' ? 'disabled' : ''}
                                                data-bs-toggle="tooltip" data-bs-placement="top" title="${window.houseExpenseTranslations?.view_receipt || 'View Receipt'}">
                                            <i class="fa fa-eye"></i>
                                        </button>
                                        <button type="button" class="${editBtnClass}"
                                                data-record-type="${row.record_type || 'expense'}"
                                                data-expense-id="${row.expense_id}"
                                                data-category-id="${attrEncode(row.expense_category_id || '')}"
                                                data-receipt-no="${attrEncode(row.RECEIPT_NO || '')}"
                                                data-date-time="${attrEncode(row.DATE_TIME || row.ENCODED_DT || '')}"
                                                data-description="${attrEncode(row.DESCRIPTION || '')}"
                                                data-amount="${amount}"
                                                data-oic="${attrEncode(row.OIC || '')}"
                                                data-bs-toggle="tooltip" data-bs-placement="top" title="${window.houseExpenseTranslations?.edit_expense || 'Edit Expense'}">
                                            <i class="fa fa-pencil-alt"></i>
                                        </button>
                                        ${historyBtnHtml}
                                        <button type="button" class="btn btn-sm btn-alt-secondary"
                                                onclick="downloadReceipt('${row.photoUrl}')"
                                                ${row.record_type === 'return_money' ? 'disabled' : ''}
                                                data-bs-toggle="tooltip" data-bs-placement="top" title="${window.houseExpenseTranslations?.download_receipt || 'Download Receipt'}">
                                            <i class="fa fa-download"></i>
                                        </button>
                                        <button type="button" class="btn btn-sm btn-alt-secondary"
                                                onclick="${row.record_type === 'return_money' ? `archive_return_money(${row.expense_id})` : `archive_expense(${row.expense_id})`}"
                                                data-bs-toggle="tooltip" data-bs-placement="top" title="${window.houseExpenseTranslations?.archive_expense || 'Archive Expense'}">
                                            <i class="fa fa-trash-alt"></i>
                                        </button>
                                    </div>`;
                            } else {
                                btn = `
                                    <div class="house-expense-actions">
                                        <button type="button" class="btn btn-sm btn-primary"
                                                onclick="viewReceipt('${row.photoUrl}')"
                                                ${row.record_type === 'return_money' ? 'disabled' : ''}
                                                data-bs-toggle="tooltip" data-bs-placement="top" title="${window.houseExpenseTranslations?.view_receipt || 'View Receipt'}">
                                            <i class="fa fa-eye"></i>
                                        </button>
                                        <button type="button" class="${editBtnClassReadonly}" disabled
                                                data-bs-toggle="tooltip" data-bs-placement="top" title="${window.houseExpenseTranslations?.edit_expense || 'Edit Expense'}">
                                            <i class="fa fa-pencil-alt"></i>
                                        </button>
                                        ${historyBtnHtml}
                                        <button type="button" class="btn btn-sm btn-secondary"
                                                onclick="downloadReceipt('${row.photoUrl}')"
                                                ${row.record_type === 'return_money' ? 'disabled' : ''}
                                                data-bs-toggle="tooltip" data-bs-placement="top" title="${window.houseExpenseTranslations?.download_receipt || 'Download Receipt'}">
                                            <i class="fa fa-download"></i>
                                        </button>
                                        <button type="button" class="btn btn-sm btn-alt-secondary" disabled
                                                data-bs-toggle="tooltip" data-bs-placement="top" title="${window.houseExpenseTranslations?.archive_expense || 'Archive Expense'}">
                                            <i class="fa fa-trash-alt"></i>
                                        </button>
                                    </div>`;
                            }
                        
                            const formattedDate = moment.utc(row.ENCODED_DT).utcOffset(8).format('MMMM DD, YYYY HH:mm:ss');
                            
                            let expenseTypeLabel = '-';
                            if (row.record_type !== 'return_money') {
                                const typeValue = parseInt(row.expense_type, 10);
                                expenseTypeLabel = (typeValue === 2)
                                    ? nonGoodsTypeLabel
                                    : goodsTypeLabel;
                            }
                            
                            const formattedAmount = amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
                            const amountDisplay = row.record_type === 'return_money' 
                                ? `<span style="color: green;">${formattedAmount}</span>`
                                : formattedAmount;
                            
                            // For Return Money: description goes in second column (DESCRIPTION); RECEIPT NO column shows '-'
                            dataTable.row.add([
                                row.expense_category || 'N/A',
                                // expenseTypeLabel, // Type column hidden per request
                                row.record_type === 'return_money' ? (row.DESCRIPTION || '-') : (row.RECEIPT_NO || '-'),
                                row.record_type === 'return_money' ? '-' : (row.DESCRIPTION || '-'),
                                amountDisplay,
                                formattedDate,
                                btn
                            ]).draw();
                        });
                        
                        setHouseExpenseFooterTotals(total_expense, total_return_money);
                        renderHouseExpenseAnalytics(data, total_expense, total_return_money);
                        window.houseExpenseLastRows = data;
                        
                        if (typeof window.updateSettleButtonState === 'function') {
                            window.updateSettleButtonState(data.length);
                        }
                    },
            error: function (xhr, status, error) {
                // Error fetching data
            }
        });
    };

    // Settlement button click handler
    $('#btn-daily-settle').on('click', function (e) {
        e.preventDefault();
        if ($(this).hasClass('disabled') || $(this).prop('disabled')) return;
        var settlementDate = window.selectedSettlementDate || new Date().toISOString().slice(0, 10);
        var formattedDate = settlementDate ? new Date(settlementDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : settlementDate;
        var $btn = $(this);
        
        Swal.fire({
            title: 'Confirm Settlement',
            text: 'Settle all expenses for ' + formattedDate + '?',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Yes, Settle',
            cancelButtonText: 'Cancel',
            confirmButtonColor: '#0d6efd',
            cancelButtonColor: '#6c757d'
        }).then(function (result) {
            if (!result.isConfirmed) return;
            $btn.addClass('disabled').css('pointer-events', 'none').css('opacity', '0.5');
            $.ajax({
                url: '/expense_daily_settlement/run',
                method: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({ settlement_date: settlementDate }),
                success: function (res) {
                    var settledDate = (res && res.settlement_date) ? res.settlement_date : $('.day-selector-wrapper').attr('data-today');
                    window.selectedSettlementDate = settledDate || '';
                    
                    // Update settled dates array to include the newly settled date
                    if (settledDate && window.settledDatesForMonth) {
                        if (window.settledDatesForMonth.indexOf(settledDate) === -1) {
                            window.settledDatesForMonth.push(settledDate);
                            window.settledDatesForMonth.sort();
                        }
                    }
                    
                    var pickerEl = document.getElementById('settlement-date-picker');
                    if (pickerEl && pickerEl._flatpickr) pickerEl._flatpickr.setDate(settledDate || '', false);
                    
                    // Keep date-range picker plain (no settled-day highlight)
                    var dateRangePickerEl = document.getElementById('daterange-picker');
                    if (dateRangePickerEl && dateRangePickerEl._flatpickr && dateRangePickerEl._flatpickr.isOpen) {
                        var instance = dateRangePickerEl._flatpickr;
                        setTimeout(function () {
                            if (!instance.calendarContainer) return;
                            var days = instance.calendarContainer.querySelectorAll('.flatpickr-day.settled-day');
                            days.forEach(function (el) {
                                el.classList.remove('settled-day');
                            });
                        }, 0);
                    }
                    
                    var settledFormatted = (settledDate || settlementDate) ? new Date((settledDate || settlementDate) + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : (settledDate || settlementDate);
                    Swal.fire({
                        title: 'Settled',
                        text: 'Settlement for ' + settledFormatted + ' completed. Expenses: ' + (res.expense_count || 0) + ', Return Money: ' + (res.return_money_count || 0),
                        icon: 'success',
                        confirmButtonText: 'OK',
                        confirmButtonColor: '#0d6efd'
                    }).then(function () {
                        window.location.reload();
                    });
                },
                error: function (xhr) {
                    var err = (xhr.responseJSON && xhr.responseJSON.error) || 'Failed to run settlement';
                    Swal.fire({
                        title: 'Error',
                        text: err,
                        icon: 'error',
                        confirmButtonText: 'OK',
                        confirmButtonColor: '#0d6efd'
                    });
                },
                complete: function () {
                    if (typeof window.updateSettleButtonState === 'function') window.updateSettleButtonState();
                }
            });
        });
    });

    // Initialize settlement UI state
    if (typeof window.updateSettleButtonState === 'function') window.updateSettleButtonState();
    if (typeof window.updateNavigationButtons === 'function') window.updateNavigationButtons();

    // Initial load with settlement date
    if (typeof window.reloadData === 'function') {
        window.reloadData();
    }

    // Event delegation for Edit button (avoids inline onclick issues with special chars: newlines, quotes, etc.)
    $(document).on('click', '.btn-edit-row', function () {
        var $btn = $(this);
        var recordType = $btn.attr('data-record-type') || 'expense';
        var id = $btn.attr('data-expense-id');
        var description = $btn.attr('data-description') || '';
        var amount = $btn.attr('data-amount') || '0';
        if (recordType === 'return_money') {
            edit_return_money(id, description, amount);
        } else {
            var categoryId = $btn.attr('data-category-id') || '';
            var receiptNo = $btn.attr('data-receipt-no') || '';
            var dateTime = $btn.attr('data-date-time') || '';
            var oic = $btn.attr('data-oic') || '';
            edit_expense(id, categoryId, receiptNo, dateTime, description, amount, oic);
        }
    });

    $(document).on('click', '.js-expense-graph-cat-open', function () {
        var categoryName = $(this).attr('data-category') || '';
        showExpenseBreakdownModalByCategory(categoryName);
    });

    $(document).on('click', '.js-expense-main-cat', function (e) {
        if ($(e.target).closest('.expense-cat-actions').length) return;
        var raw = $(this).attr('data-main');
        window.houseExpenseExplorerState.mainCategory = raw ? raw : null;
        window.houseExpenseExplorerState.subCategory = null;
        refreshHouseExpenseExplorerOnly();
    });

    $(document).on('click', '.js-expense-sub-cat', function (e) {
        if ($(e.target).closest('.expense-cat-actions').length) return;
        e.stopPropagation();
        window.houseExpenseExplorerState.mainCategory = $(this).attr('data-main') || null;
        var rawSub = $(this).attr('data-sub');
        window.houseExpenseExplorerState.subCategory = rawSub ? rawSub : null;
        refreshHouseExpenseExplorerOnly();
    });

    $(document).on('click', '.js-house-expense-cat-edit', function (e) {
        e.preventDefault();
        e.stopPropagation();
        openHouseExpenseEditCategoryModal($(this).attr('data-category-id'));
    });

    $(document).on('click', '.js-house-expense-cat-delete', function (e) {
        e.preventDefault();
        e.stopPropagation();
        archiveHouseExpenseCategory($(this).attr('data-category-id'));
    });

    $(document).on('click', '#btn-house-expense-add-main-cat', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (!window.PermissionViewOnly || !window.PermissionViewOnly.isExpenseHandler()) return;
        openHouseExpenseQuickCategoryModal('main');
    });

    $(document).on('click', '#btn-house-expense-add-sub-cat', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (!window.PermissionViewOnly || !window.PermissionViewOnly.isExpenseHandler()) return;
        if ($(this).prop('disabled')) return;
        openHouseExpenseQuickCategoryModal('sub');
    });

    $('#form-house-expense-quick-category').on('submit', function (e) {
        e.preventDefault();
        if (!window.PermissionViewOnly || !window.PermissionViewOnly.isExpenseHandler()) return;
        var $form = $(this);
        var name = String($('#house-expense-quick-cat-name').val() || '').trim();
        if (!name) {
            $('#house-expense-quick-cat-name').addClass('is-invalid');
            return;
        }
        $('#house-expense-quick-cat-name').removeClass('is-invalid');

        var level = $('#house-expense-quick-cat-level').val();
        var payload = { txtCategory: name };
        if (level === 'sub') {
            payload.txtParentId = $('#house-expense-quick-cat-parent-id').val();
            if (!payload.txtParentId) {
                if (typeof Swal !== 'undefined') {
                    Swal.fire({
                        icon: 'error',
                        title: 'Error',
                        text: 'Please select a main category first.'
                    });
                }
                return;
            }
        }

        var editId = String($('#house-expense-quick-cat-id').val() || '').trim();
        var isEdit = !!editId;
        var $btn = $('#btn-house-expense-quick-cat-save');
        var originalHtml = $btn.html();
        $btn.prop('disabled', true).html('Saving...');

        $.ajax({
            url: isEdit ? '/expense_category/' + editId : '/add_expense_category',
            method: isEdit ? 'PUT' : 'POST',
            data: payload,
            headers: { Accept: 'application/json' },
            success: function (response) {
                hideBootstrapModal($('#modal-house-expense-quick-category'));
                if (isEdit) {
                    syncHouseExpenseExplorerStateAfterCategoryRename(editId, name);
                } else {
                    var parentId =
                        level === 'sub'
                            ? payload.txtParentId || (response && response.parentId)
                            : null;
                    selectHouseExpenseExplorerAfterCategoryAdd(level, name, parentId);
                }
                refreshHouseExpenseAfterCategoryCatalogChange({ preserveExplorerState: true });
                if (typeof Swal !== 'undefined') {
                    Swal.fire({
                        icon: 'success',
                        title: isEdit ? 'Category updated' : 'Category saved',
                        timer: 1400,
                        showConfirmButton: false
                    });
                }
            },
            error: function (xhr) {
                var msg = (xhr.responseJSON && xhr.responseJSON.message) || xhr.responseText || 'Could not save category.';
                if (typeof Swal !== 'undefined') {
                    Swal.fire({ icon: 'error', title: 'Error', text: msg });
                }
            },
            complete: function () {
                $btn.prop('disabled', false).html(originalHtml);
            }
        });
    });

    $(document).on('click', '#breakdown-modal-head-table thead th.sortable-col', function () {
        var key = $(this).attr('data-sort-key') || 'date_time';
        var state = window.houseExpenseBreakdownState || {};
        if (state.sortKey === key) {
            state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
            state.sortKey = key;
            state.sortDir = key === 'date_time' ? 'desc' : 'asc';
        }
        window.houseExpenseBreakdownState = state;
        renderExpenseBreakdownModalRows();
    });

    // Utility functions for receipt actions
    window.viewReceipt = function (photoUrl) {
        if (!photoUrl || photoUrl.trim() === "" || photoUrl === "null") {
        Swal.fire({
            icon: 'warning',
            title: window.houseExpenseTranslations?.no_receipt_uploaded || 'No Receipt Uploaded',
            text: window.houseExpenseTranslations?.no_receipt_available || 'There is no receipt available to view.',
            confirmButtonText: window.houseExpenseTranslations?.ok || 'OK'
        });
            return;
        }
        Swal.fire({
            title: '',
            imageUrl: photoUrl,
            imageAlt: window.houseExpenseTranslations?.receipt_image || 'Receipt Image',
            showCloseButton: true,
            showConfirmButton: false,
            width: 'auto',
            padding: '1rem',
            background: '#fff'
        });
    };

    window.downloadReceipt = function (photoUrl) {
        var a = document.createElement('a');
        a.href = photoUrl;
        a.download = photoUrl.substring(photoUrl.lastIndexOf('/') + 1);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };


    // Kapag sine-submit ang form para sa pag-edit
    $('#edit_junket_house_expense').submit(function (event) {
        event.preventDefault();

        var resolvedCategory = syncHouseExpenseCategoryHiddenField(
            '#expense-edit-main-category-select',
            '#expense-edit-sub-category-select',
            '#house-expense-edit-category-id'
        );
        if (!$('#expense-edit-main-category-select').val() || !resolvedCategory) {
            Swal.fire({
                icon: 'error',
                title: window.houseExpenseTranslations?.error || 'Error!',
                text: 'Please select a valid category.'
            });
            return false;
        }

        const $btn = $('#btn-save-edit-expense');
        const originalHtml = $btn.html();

        // Show loading spinner on button
        $btn.prop('disabled', true).html(`
        <span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
        ${window.houseExpenseTranslations?.saving || 'Saving'}...
    `);

        const formData = new FormData(this);

        $.ajax({
            url: '/junket_house_expense/' + expense_id,
            type: 'PUT',
            data: formData,
            processData: false,
            contentType: false,
            success: function (response) {
                Swal.fire({
                    icon: 'success',
                    title: window.houseExpenseTranslations?.updated_successfully || 'Updated successfully!',
                    text: window.houseExpenseTranslations?.expense_updated || 'House expense has been updated.',
                    confirmButtonText: window.houseExpenseTranslations?.ok || 'OK',
                    allowOutsideClick: false
                }).then((result) => {
                    if (result.isConfirmed) {
                        hideBootstrapModal($('#modal-edit-house-expense'));
                        refreshHouseExpenseAfterMutation();
                    }
                });
            },
            error: function (error) {
                Swal.fire({
                    icon: 'error',
                    title: window.houseExpenseTranslations?.error || 'Error!',
                    text: window.houseExpenseTranslations?.error_updating_expense || 'There was an error updating the expense.',
                    confirmButtonText: window.houseExpenseTranslations?.ok || 'OK'
                });
            },
            complete: function () {
                // Reset button after request finishes
                $btn.prop('disabled', false).html(originalHtml);
            }
        });
    });
});


function addHouseExpense() {
    showBootstrapModal($('#modal-new-house-expense'));
    get_agent();
}

function returnMoney() {
    showBootstrapModal($('#modal-new-return-money'));
}

function edit_expense(id, category_id, receipt_no, datetimeval, description, amount, oic) {
    var $modal = $('#modal-edit-house-expense');
    showBootstrapModal($modal);
    $modal.find('[name="txtReceiptNo"]').val(receipt_no);

    // ✅ Sanitize and format datetime properly
    let formattedDate = '';
    if (datetimeval) {
        const parsedDate = moment(datetimeval, ['YYYY-MM-DD HH:mm:ss', 'MMMM DD, YYYY HH:mm:ss', moment.ISO_8601], true);
        if (parsedDate.isValid()) {
            formattedDate = parsedDate.format('YYYY-MM-DD');
        } else {
            formattedDate = '';
        }
    }

    $modal.find('[name="txtDateandTime"]').val(formattedDate);
    $modal.find('[name="txtDescription"]').val(description);
    $modal.find('[name="txtAmount"]').val(amount);
    // $('#txtOfficerInCharge').val(oic);

    expense_id = id;

    edit_expense_category(category_id);
}


function archive_expense(id) {
    Swal.fire({
        title: window.houseExpenseTranslations?.delete_confirmation || 'Are you sure you want to delete this?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: window.houseExpenseTranslations?.yes || 'Yes'
    }).then((result) => {
        if (result.isConfirmed) {
            $.ajax({
                url: '/junket_house_expense/remove/' + id,
                type: 'PUT',
                success: function (response) {
                    Swal.fire({
                        icon: 'success',
                        title: window.houseExpenseTranslations?.updated_successfully || 'Deleted successfully!',
                        text: window.houseExpenseTranslations?.expense_deleted || 'House expense has been deleted.',
                        confirmButtonText: window.houseExpenseTranslations?.ok || 'OK',
                        allowOutsideClick: false
                    }).then((result) => {
                        if (result.isConfirmed) {
                            refreshHouseExpenseAfterMutation();
                        }
                    });
                },
                error: function (error) {
                    Swal.fire({
                        icon: 'error',
                        title: window.houseExpenseTranslations?.error || 'Error!',
                        text: window.houseExpenseTranslations?.error_deleting_expense || 'Failed to delete expense. Please try again.',
                        confirmButtonText: window.houseExpenseTranslations?.ok || 'OK'
                    });
                }
            });
        }
    })
}

function edit_return_money(id, description, amount) {
    showBootstrapModal($('#modal-edit-return-money'));
    $('#txtReturnMoneyDescription').val(description);
    
    // Format amount with commas
    const amountNum = parseFloat(amount) || 0;
    const formattedAmount = amountNum.toLocaleString('en-US', { 
        minimumFractionDigits: 0, 
        maximumFractionDigits: 0 
    });
    $('#txtReturnMoneyAmount').val(formattedAmount);
    
    return_money_id = id;
}

function archive_return_money(id) {
    Swal.fire({
        title: window.houseExpenseTranslations?.delete_confirmation || 'Are you sure you want to delete this?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: window.houseExpenseTranslations?.yes || 'Yes'
    }).then((result) => {
        if (result.isConfirmed) {
            $.ajax({
                url: '/remove_return_money/' + id,
                type: 'PUT',
                success: function (response) {
                    Swal.fire({
                        icon: 'success',
                        title: window.houseExpenseTranslations?.updated_successfully || 'Deleted successfully!',
                        text: window.houseExpenseTranslations?.return_deleted || 'Return money has been deleted.',
                        confirmButtonText: window.houseExpenseTranslations?.ok || 'OK',
                        allowOutsideClick: false
                    }).then((result) => {
                        if (result.isConfirmed) {
                            refreshHouseExpenseAfterMutation();
                        }
                    });
                },
                error: function (error) {
                    Swal.fire({
                        icon: 'error',
                        title: 'Error',
                        text: 'Failed to delete return money. Please try again.'
                    });
                }
            });
        }
    })
}

// Form submission handler for edit return money
$(document).ready(function() {
    $('#edit_return_money').submit(function (event) {
        event.preventDefault();

        const $btn = $('#btn-save-edit-return-money');
        const originalHtml = $btn.html();

        // Show loading spinner on button
        $btn.prop('disabled', true).html(`
            <span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
            ${window.houseExpenseTranslations?.saving || 'Saving'}...
        `);

        const formData = {
            txtDescription: $('#txtReturnMoneyDescription').val(),
            txtAmount: $('#txtReturnMoneyAmount').val()
        };

        $.ajax({
            url: '/edit_return_money/' + return_money_id,
            type: 'PUT',
            data: formData,
            success: function (response) {
                Swal.fire({
                    icon: 'success',
                    title: window.houseExpenseTranslations?.updated_successfully || 'Updated successfully!',
                    text: 'Return money has been updated.',
                    confirmButtonText: window.houseExpenseTranslations?.ok || 'OK',
                    allowOutsideClick: false
                }).then((result) => {
                    if (result.isConfirmed) {
                        hideBootstrapModal($('#modal-edit-return-money'));
                        refreshHouseExpenseAfterMutation();
                    }
                });
            },
            error: function (error) {
                Swal.fire({
                    icon: 'error',
                    title: window.houseExpenseTranslations?.error || 'Error!',
                    text: 'There was an error updating the return money.',
                    confirmButtonText: window.houseExpenseTranslations?.ok || 'OK'
                });
            },
            complete: function () {
                // Reset button after request finishes
                $btn.prop('disabled', false).html(originalHtml);
            }
        });
    });
});

function expense_category(selectedCategoryId, done, options) {
    options = options && typeof options === 'object' ? options : {};
    $.ajax({
        url: '/expense_category_data',
        method: 'GET',
        success: function (response) {
            cacheHouseExpenseCategoryData(response || []);
            window.houseExpenseCategoryTree = buildHouseExpenseCategoryTreeFromFlat(response || []);
            window.houseExpenseCategoryCatalog = window.houseExpenseCategoryTree;
            if (
                !options.skipExplorerRefresh &&
                window.houseExpenseLastRows &&
                $('#expense-main-cat-list').length
            ) {
                refreshHouseExpenseExplorerOnly();
            }

            populateHouseExpenseMainCategorySelect($('#expense-main-category-select'));
            populateHouseExpenseMainCategorySelect($('#expense-edit-main-category-select'));
            refreshHouseExpenseSubCategorySelect(null, null, $('#expense-sub-category-select'), $('#house-expense-sub-category-wrap'));
            refreshHouseExpenseSubCategorySelect(null, null, $('#expense-edit-sub-category-select'), $('#house-expense-edit-sub-category-wrap'));

            if (selectedCategoryId) {
                setHouseExpenseCategoryPickersFromId(selectedCategoryId);
            }

            if (typeof done === 'function') done();
        },
        error: function () {
            if (typeof done === 'function') done();
        }
    });
}

function setHouseExpenseCategoryPickersFromId(categoryId) {
    var flat = window.houseExpenseCategoryFlat || [];
    var row = flat.find(function (r) {
        return Number(r.IDNo) === Number(categoryId);
    });
    if (!row) return;

    var isSub = row.PARENT_ID != null && Number(row.PARENT_ID) > 0;
    if (isSub) {
        $('#expense-edit-main-category-select').val(String(row.PARENT_ID));
        refreshHouseExpenseSubCategorySelect(row.PARENT_ID, row.IDNo, $('#expense-edit-sub-category-select'), $('#house-expense-edit-sub-category-wrap'));
        $('#expense-edit-sub-category-select').val(String(row.IDNo));
    } else {
        $('#expense-edit-main-category-select').val(String(row.IDNo));
        refreshHouseExpenseSubCategorySelect(row.IDNo, null, $('#expense-edit-sub-category-select'), $('#house-expense-edit-sub-category-wrap'));
    }
    syncHouseExpenseCategoryHiddenField(
        '#expense-edit-main-category-select',
        '#expense-edit-sub-category-select',
        '#house-expense-edit-category-id'
    );
}

function edit_expense_category(id) {
    expense_category(id);
}

function get_agent() {
    $.ajax({
        url: '/users',
        method: 'GET',
        success: function (response) {
            var selectOptions = $('#oic');
            selectOptions.empty();
            selectOptions.append($('<option>', {
                value: '',
                text: window.houseExpenseTranslations?.select_officer_in_charge || '--SELECT OFFICER IN CHARGE--'
            }));
            response.forEach(function (option) {
                selectOptions.append($('<option>', {
                    value: option.user_id,
                    text: option.FIRSTNAME + ' ' + option.LASTNAME
                }));
            });
        },
        error: function (xhr, status, error) {
            // Error fetching options
        }
    });
}

$(document).ready(function () {
    $("input[data-type='number']").keyup(function (event) {
        // skip for arrow keys
        if (event.which >= 37 && event.which <= 40) {
            event.preventDefault();
        }
        var $this = $(this);
        var num = $this.val().replace(/,/gi, "");
        var num2 = num.split(/(?=(?:\d{3})+$)/).join(",");
        $this.val(num2);
    });

    $(document).on('change', '#expense-main-category-select', function () {
        refreshHouseExpenseSubCategorySelect(
            $(this).val(),
            null,
            $('#expense-sub-category-select'),
            $('#house-expense-sub-category-wrap')
        );
        syncHouseExpenseCategoryHiddenField(
            '#expense-main-category-select',
            '#expense-sub-category-select',
            '#house-expense-category-id'
        );
    });
    $(document).on('change', '#expense-sub-category-select', function () {
        syncHouseExpenseCategoryHiddenField(
            '#expense-main-category-select',
            '#expense-sub-category-select',
            '#house-expense-category-id'
        );
    });
    $(document).on('change', '#expense-edit-main-category-select', function () {
        refreshHouseExpenseSubCategorySelect(
            $(this).val(),
            null,
            $('#expense-edit-sub-category-select'),
            $('#house-expense-edit-sub-category-wrap')
        );
        syncHouseExpenseCategoryHiddenField(
            '#expense-edit-main-category-select',
            '#expense-edit-sub-category-select',
            '#house-expense-edit-category-id'
        );
    });
    $(document).on('change', '#expense-edit-sub-category-select', function () {
        syncHouseExpenseCategoryHiddenField(
            '#expense-edit-main-category-select',
            '#expense-edit-sub-category-select',
            '#house-expense-edit-category-id'
        );
    });

    // New house expense modal: bind only when jQuery and DOM are ready (fixes "$ is not defined")
    var isSubmittingNewExpense = false;
    $('#modal-new-house-expense').on('shown.bs.modal', function () {
        isSubmittingNewExpense = false;
        var $btn = $('#btn-save-new-expense');
        var originalText = $btn.data('original-text') || $btn.html();
        var isViewOnly = window.PermissionViewOnly && window.PermissionViewOnly.isViewOnly && window.PermissionViewOnly.isViewOnly();
        if (!isViewOnly) $btn.prop('disabled', false).html(originalText);
        var $form = $('#add_junket_house_expense');
        if ($form.length) $form[0].reset();
        expense_category(null, function () {
            applyHouseExpenseExplorerToNewExpenseForm();
        });
    });
    $('#modal-new-house-expense').on('hidden.bs.modal', function () {
        isSubmittingNewExpense = false;
        var $btn = $('#btn-save-new-expense');
        var originalText = $btn.data('original-text') || $btn.html();
        var isViewOnly = window.PermissionViewOnly && window.PermissionViewOnly.isViewOnly && window.PermissionViewOnly.isViewOnly();
        if (!isViewOnly) $btn.prop('disabled', false).html(originalText);
    });
    $('#add_junket_house_expense').on('submit', function (event) {
        event.preventDefault();
        if (isSubmittingNewExpense) return false;
        var resolvedCategory = syncHouseExpenseCategoryHiddenField(
            '#expense-main-category-select',
            '#expense-sub-category-select',
            '#house-expense-category-id'
        );
        if (!$('#expense-main-category-select').val()) {
            if (typeof Swal !== 'undefined') {
                Swal.fire({ icon: 'error', title: 'Inserting Error', text: 'Please select a main category.' });
            }
            return false;
        }
        if (!resolvedCategory) {
            if (typeof Swal !== 'undefined') {
                Swal.fire({ icon: 'error', title: 'Inserting Error', text: 'Please select a sub category.' });
            }
            return false;
        }
        var isValid = true;
        $(this).find(':input[required]').each(function () {
            if ($(this).val() === '') {
                isValid = false;
                $(this).addClass('is-invalid');
            } else {
                $(this).removeClass('is-invalid');
            }
        });
        if (!isValid) {
            if (typeof Swal !== 'undefined') {
                Swal.fire({ icon: 'error', title: 'Inserting Error', text: 'Please fill in all required fields.' });
            }
            return false;
        }
        isSubmittingNewExpense = true;
        var $submitBtn = $('#btn-save-new-expense');
        var originalText = $submitBtn.html();
        $submitBtn.prop('disabled', true).html('Saving...');
        var formData = new FormData(this);
        var $form = $(this);
        $.ajax({
            url: '/add_junket_house_expense',
            type: 'POST',
            data: formData,
            processData: false,
            contentType: false,
            success: function (response) {
                isSubmittingNewExpense = false;
                $submitBtn.prop('disabled', false).html(originalText);
                if (typeof Swal !== 'undefined') {
                    Swal.fire({ icon: 'success', title: 'Added successfully', confirmButtonText: 'OK', showConfirmButton: true }).then(function () {
                        hideBootstrapModal($('#modal-new-house-expense'));
                        refreshHouseExpenseAfterMutation();
                    });
                } else {
                    hideBootstrapModal($('#modal-new-house-expense'));
                    refreshHouseExpenseAfterMutation();
                }
            },
            error: function (xhr, status, error) {
                isSubmittingNewExpense = false;
                $submitBtn.prop('disabled', false).html(originalText);
                var errorMessage = (xhr.responseJSON && xhr.responseJSON.error) ? xhr.responseJSON.error : 'An error occurred';
                if (typeof Swal !== 'undefined') {
                    Swal.fire({ icon: 'error', title: 'Error', text: errorMessage || 'Failed to save expense. Please try again.' });
                }
                console.error('Error saving house expense:', error);
            }
        });
        return false;
    });

    // New return money modal: bind after jQuery is ready (fixes "$ is not defined" on house_expense page)
    var isSubmittingReturnMoney = false;
    $('#modal-new-return-money').on('shown.bs.modal', function () {
        isSubmittingReturnMoney = false;
        var $btn = $('#btn-save-new-return-money');
        var originalText = $btn.data('original-text') || $btn.html();
        var isViewOnly = window.PermissionViewOnly && window.PermissionViewOnly.isViewOnly && window.PermissionViewOnly.isViewOnly();
        if (!isViewOnly) $btn.prop('disabled', false).html(originalText);
        var $formEl = document.getElementById('add_return_money');
        if ($formEl) $formEl.reset();
    });
    $('#modal-new-return-money').on('hidden.bs.modal', function () {
        isSubmittingReturnMoney = false;
        var $btn = $('#btn-save-new-return-money');
        var originalText = $btn.data('original-text') || $btn.html();
        var isViewOnly = window.PermissionViewOnly && window.PermissionViewOnly.isViewOnly && window.PermissionViewOnly.isViewOnly();
        if (!isViewOnly) $btn.prop('disabled', false).html(originalText);
    });
    $('#add_return_money').on('submit', function (event) {
        event.preventDefault();
        if (isSubmittingReturnMoney) return false;
        var $form = $(this);
        var isValid = true;
        $form.find(':input[required]').each(function () {
            if ($(this).val() === '' || $(this).val().trim() === '') {
                isValid = false;
                $(this).addClass('is-invalid');
            } else {
                $(this).removeClass('is-invalid');
            }
        });
        if (!isValid) {
            if (typeof Swal !== 'undefined') {
                Swal.fire({ icon: 'error', title: 'Error', text: 'Please fill in all required fields.' });
            }
            return false;
        }
        isSubmittingReturnMoney = true;
        var $submitBtn = $('#btn-save-new-return-money');
        var originalText = $submitBtn.html();
        $submitBtn.prop('disabled', true).html('Saving...');
        var descriptionValue = $form.find('textarea[name="txtDescription"]').val() || '';
        var amountValue = $form.find('input[name="txtAmount"]').val() || '';
        if (amountValue) amountValue = amountValue.toString().replace(/,/g, '').trim();
        var formData = { txtDescription: descriptionValue.trim(), txtAmount: amountValue };
        if (!amountValue || amountValue === '' || parseFloat(amountValue) <= 0) {
            isSubmittingReturnMoney = false;
            $submitBtn.prop('disabled', false).html(originalText);
            if (typeof Swal !== 'undefined') {
                Swal.fire({ icon: 'error', title: 'Error', text: 'Please enter a valid amount.' });
            }
            return false;
        }
        $.ajax({
            url: '/add_return_money',
            type: 'POST',
            data: formData,
            success: function (response) {
                isSubmittingReturnMoney = false;
                $submitBtn.prop('disabled', false).html(originalText);
                if (typeof Swal !== 'undefined') {
                    Swal.fire({ icon: 'success', title: 'Added successfully', confirmButtonText: 'OK', showConfirmButton: true }).then(function () {
                        hideBootstrapModal($('#modal-new-return-money'));
                        refreshHouseExpenseAfterMutation();
                    });
                } else {
                    hideBootstrapModal($('#modal-new-return-money'));
                    refreshHouseExpenseAfterMutation();
                }
            },
            error: function (xhr, status, error) {
                isSubmittingReturnMoney = false;
                $submitBtn.prop('disabled', false).html(originalText);
                var errorMessage = (xhr.responseJSON && xhr.responseJSON.error) ? xhr.responseJSON.error : 'An error occurred';
                if (typeof Swal !== 'undefined') {
                    Swal.fire({ icon: 'error', title: 'Error', text: errorMessage || 'Failed to save return money. Please try again.' });
                }
                console.error('Error adding return money:', error);
            }
        });
        return false;
    });

    var HOUSE_EXPENSE_EXPORT_COL_INDEXES = [0, 1, 2, 3, 4];
    var HOUSE_EXPENSE_EXPORT_NUM_COLS = HOUSE_EXPENSE_EXPORT_COL_INDEXES.length;
    var HOUSE_EXPENSE_EXPORT_COL_MIN_WIDTHS = [14, 18, 14, 12, 20];
    var HOUSE_EXPENSE_EXPORT_COL_MAX_WIDTHS = [30, 56, 24, 18, 26];
    var HOUSE_EXPENSE_EXPORT_AMOUNT_COL = 4;

    function houseExpenseExportCellBorder() {
        var edge = { style: 'thin', color: { argb: 'FF000000' } };
        return { top: edge, left: edge, bottom: edge, right: edge };
    }

    function houseExpenseParseAmountForExport(htmlOrText) {
        var s = String(htmlOrText == null ? '' : htmlOrText);
        s = $('<div>').html(s).text().trim();
        s = s.replace(/\u20B1/g, '').replace(/,/g, '').replace(/\s/g, '');
        if (s === '' || s === '-') return null;
        var n = parseFloat(s);
        return isNaN(n) ? null : n;
    }

    function houseExpenseExportXlsxFileName() {
        var filterMode = $('input[name="filter-mode"]:checked').val() || 'settlement';
        if (filterMode === 'settlement') {
            var d =
                window.selectedSettlementDate ||
                ($('#settlement-date-wrapper .input-group').attr('data-default-settlement-date') || '') ||
                ($('#settlement-date-picker').val() || '');
            return 'Expenses_' + (d || 'export').replace(/[^\d\-]/g, '') + '.xlsx';
        }
        var dr = document.getElementById('daterange-picker');
        if (dr && dr._flatpickr && dr._flatpickr.selectedDates && dr._flatpickr.selectedDates.length === 2) {
            var pad = function (n) {
                return String(n).padStart(2, '0');
            };
            var a = dr._flatpickr.selectedDates[0];
            var b = dr._flatpickr.selectedDates[1];
            var f = a.getFullYear() + '-' + pad(a.getMonth() + 1) + '-' + pad(a.getDate());
            var t = b.getFullYear() + '-' + pad(b.getMonth() + 1) + '-' + pad(b.getDate());
            return 'Expenses_' + f + '_to_' + t + '.xlsx';
        }
        return 'Expenses_export.xlsx';
    }

    function houseExpenseExportAutoFitColumns(sheet, headers, rows) {
        var maxLens = [];
        for (var i = 0; i < HOUSE_EXPENSE_EXPORT_NUM_COLS; i++) {
            maxLens[i] = String(headers[i] == null ? '' : headers[i]).length;
        }
        rows.forEach(function (r) {
            for (var c = 0; c < HOUSE_EXPENSE_EXPORT_NUM_COLS; c++) {
                var v = r[c];
                var txt = (typeof v === 'number')
                    ? v.toLocaleString('en-US', { maximumFractionDigits: 0 })
                    : String(v == null ? '' : v);
                if (txt.length > maxLens[c]) maxLens[c] = txt.length;
            }
        });
        for (var col = 1; col <= HOUSE_EXPENSE_EXPORT_NUM_COLS; col++) {
            var idx = col - 1;
            var minW = HOUSE_EXPENSE_EXPORT_COL_MIN_WIDTHS[idx] || 10;
            var maxW = HOUSE_EXPENSE_EXPORT_COL_MAX_WIDTHS[idx] || 40;
            var autoW = Math.min(maxW, Math.max(minW, maxLens[idx] + 2));
            sheet.getColumn(col).width = autoW;
        }
    }

    function exportHouseExpenseTableToXlsx() {
        if (typeof ExcelJS === 'undefined') {
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    icon: 'error',
                    title: 'Export',
                    text: 'Excel library failed to load. Refresh the page and try again.'
                });
            } else {
                alert('Excel library failed to load.');
            }
            return Promise.resolve();
        }
        if (!$.fn.DataTable.isDataTable('#expense-tbl')) return Promise.resolve();
        var dt = $('#expense-tbl').DataTable();
        var numDataCols = HOUSE_EXPENSE_EXPORT_NUM_COLS;
        var headers = [];
        HOUSE_EXPENSE_EXPORT_COL_INDEXES.forEach(function (tableIdx, exportIdx) {
            var txt = $('#expense-tbl thead tr:first th').eq(tableIdx).text().replace(/\s+/g, ' ').trim();
            // Requested label change for export
            if (exportIdx === 0) txt = 'CATEGORY';
            headers.push(txt);
        });
        var rows = [];
        var noDataMsg = (window.houseExpenseTranslations && window.houseExpenseTranslations.no_data_found) || 'No data found';
        dt.rows({ search: 'applied' }).every(function () {
            var data = this.data();
            if (!data || data.length < 5) return;
            var firstText = $('<div>').html(data[0]).text().trim();
            if (firstText === noDataMsg) return;
            var cells = [];
            for (var c = 0; c < numDataCols; c++) {
                var raw = data[HOUSE_EXPENSE_EXPORT_COL_INDEXES[c]];
                if (raw === undefined || raw === null) raw = '';
                else if (typeof raw !== 'string') raw = String(raw);
                if (c === 3) {
                    var amt = houseExpenseParseAmountForExport(raw);
                    cells.push(amt !== null ? amt : $('<div>').html(raw).text().replace(/\s+/g, ' ').trim());
                } else {
                    cells.push($('<div>').html(raw).text().replace(/\s+/g, ' ').trim());
                }
            }
            rows.push(cells);
        });
        var workbook = new ExcelJS.Workbook();
        var sheet = workbook.addWorksheet('Junket Expenses', {
            views: [{ state: 'frozen', ySplit: 1 }]
        });
        sheet.addRow(headers);
        rows.forEach(function (r) {
            sheet.addRow(r);
        });
        houseExpenseExportAutoFitColumns(sheet, headers, rows);
        var hdr = sheet.getRow(1);
        hdr.height = 22;
        hdr.eachCell({ includeEmpty: true }, function (cell, colNumber) {
            if (colNumber > numDataCols) return;
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF4472C4' }
            };
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
            var hdrAlign = colNumber === HOUSE_EXPENSE_EXPORT_AMOUNT_COL ? 'right' : 'center';
            cell.alignment = { vertical: 'middle', horizontal: hdrAlign, wrapText: true };
            cell.border = houseExpenseExportCellBorder();
        });
        sheet.eachRow(function (row, rowNumber) {
            if (rowNumber === 1) return;
            row.height = 18;
            row.eachCell({ includeEmpty: true }, function (cell, colNumber) {
                if (colNumber > numDataCols) return;
                if (typeof cell.value === 'number') {
                    cell.numFmt = '#,##0';
                }
                var bodyAlign = colNumber === HOUSE_EXPENSE_EXPORT_AMOUNT_COL ? 'right' : 'center';
                cell.alignment = { vertical: 'middle', horizontal: bodyAlign, wrapText: false };
                cell.border = houseExpenseExportCellBorder();
            });
        });
        return workbook.xlsx.writeBuffer().then(function (buffer) {
            var blob = new Blob([buffer], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = houseExpenseExportXlsxFileName();
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    }

    $(document).on('click', '#btn-export-house-expense', function (e) {
        e.preventDefault();
        var $btn = $('#btn-export-house-expense');
        $btn.prop('disabled', true);
        exportHouseExpenseTableToXlsx()
            .catch(function (err) {
                console.error(err);
                if (typeof Swal !== 'undefined') {
                    Swal.fire({
                        icon: 'error',
                        title: 'Export failed',
                        text: err && err.message ? err.message : 'Could not create file.'
                    });
                }
            })
            .finally(function () {
                $btn.prop('disabled', false);
            });
    });
});

function onlyNumberKey(evt) {

    let ASCIICode = (evt.which) ? evt.which : evt.keyCode
    if (ASCIICode > 31 && (ASCIICode < 48 || ASCIICode > 57))
        return false;
    return true;
}
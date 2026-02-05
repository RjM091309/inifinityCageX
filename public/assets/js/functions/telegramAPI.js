var telegramAPI_id;
var chatIdsList = [];
var chatIdEditIndex = null; // null = add, number = edit at index
var employeeChatIdsList = [];
var employeeChatIdEditIndex = null; // null = add, number = edit at index
var managementChatIdsList = [];
var managementChatIdEditIndex = null; // null = add, number = edit at index

$(document).ready(function () {
    const $botDetails = $('#bot-details');
    const $botStatus = $('#bot-status');

    function setBotStatus(label, badgeClass) {
        if ($botStatus.length) $botStatus.removeClass('bg-secondary bg-success bg-danger').addClass(badgeClass).text(label);
    }

    function setBotDetails(html, alertClass) {
        if ($botDetails.length) $botDetails.removeClass('alert-secondary alert-success alert-danger').addClass(alertClass).html(html);
    }

    function loadBotDetails() {
        const translations = window.telegramAPITranslations || {};
        const checking = translations.checking || 'Checking...';
        const loadingBotDetails = translations.loading_bot_details || 'Loading bot details...';
        const botName = translations.bot_name || 'Bot name:';
        const username = translations.username || 'Username:';
        const openBot = translations.open_bot || 'Open bot';
        const active = translations.active || 'Active';
        const unavailable = translations.unavailable || 'Unavailable';
        const noBotDetails = translations.no_bot_details || 'No bot details found. Save a valid token to load details.';
        const error = translations.error || 'Error';
        const couldNotLoad = translations.could_not_load || 'Could not load bot details. Please verify the token.';

        setBotStatus(checking, 'bg-secondary');
        setBotDetails(`<div class="text-muted">${loadingBotDetails}</div>`, 'alert-secondary');

        $.ajax({
            url: '/telegramAPI/details',
            method: 'GET',
            success: function (data) {
                if (data && data.bot) {
                    const bot = data.bot;
                    const botLink = bot.username ? `https://t.me/${bot.username}` : null;
                    const rows = [
                        `<div><span class="fw-semibold">${botName}</span> ${bot.first_name || '—'}</div>`,
                        `<div><span class="fw-semibold">${username}</span> ${bot.username ? `<a href="${botLink}" target="_blank" rel="noopener">@${bot.username}</a>` : '—'}</div>`,
                        botLink ? `<div class="mt-2"><a class="btn btn-sm btn-outline-primary" href="${botLink}" target="_blank" rel="noopener">${openBot}</a></div>` : ''
                    ];

                    setBotStatus(active, 'bg-success');
                    setBotDetails(rows.join(''), 'alert-success');
                } else {
                    setBotStatus(unavailable, 'bg-secondary');
                    setBotDetails(`<div class="text-muted">${noBotDetails}</div>`, 'alert-secondary');
                }
            },
            error: function () {
                setBotStatus(error, 'bg-danger');
                setBotDetails(`<div class="text-danger">${couldNotLoad}</div>`, 'alert-danger');
            }
        });
    }

    function loadChatIds() {
        $.ajax({
            url: '/telegramAPI/chat-ids',
            method: 'GET',
            success: function (data) {
                chatIdsList = Array.isArray(data.chatIds) ? data.chatIds : [];
                renderChatIdsTable();
            },
            error: function () {
                chatIdsList = [];
                renderChatIdsTable();
            }
        });
    }

    function renderChatIdsTable() {
        const tbody = $('#chat-ids-tbody');
        const emptyEl = $('#chat-ids-empty');
        const tr = translations();
        if (!chatIdsList.length) {
            tbody.html('');
            emptyEl.show();
            return;
        }
        emptyEl.hide();
        tbody.html(chatIdsList.map(function (id, i) {
            return '<tr><td>' + (i + 1) + '</td><td><code>' + escapeHtml(String(id)) + '</code></td><td class="text-center">' +
                '<button type="button" class="btn btn-sm btn-alt-secondary me-1 btn-edit-chat-id" data-index="' + i + '" title="' + (tr.edit || 'Edit') + '"><i class="fa fa-pencil-alt"></i></button>' +
                '<button type="button" class="btn btn-sm btn-alt-danger btn-delete-chat-id" data-index="' + i + '" title="' + (tr.delete || 'Delete') + '"><i class="fa fa-trash"></i></button>' +
                '</td></tr>';
        }).join(''));
    }

    function escapeHtml(s) {
        const div = document.createElement('div');
        div.textContent = s;
        return div.innerHTML;
    }

    function translations() {
        return window.telegramAPITranslations || {};
    }

    function loadEmployeeChatIds() {
        $.ajax({
            url: '/telegramAPI/employee-chat-ids',
            method: 'GET',
            success: function (data) {
                employeeChatIdsList = Array.isArray(data.chatIds) ? data.chatIds : [];
                renderEmployeeChatIdsTable();
            },
            error: function () {
                employeeChatIdsList = [];
                renderEmployeeChatIdsTable();
            }
        });
    }

    function renderEmployeeChatIdsTable() {
        const tbody = $('#employee-chat-ids-tbody');
        const emptyEl = $('#employee-chat-ids-empty');
        const tr = translations();
        if (!employeeChatIdsList.length) {
            tbody.html('');
            emptyEl.show();
            return;
        }
        emptyEl.hide();
        tbody.html(employeeChatIdsList.map(function (id, i) {
            return '<tr><td>' + (i + 1) + '</td><td><code>' + escapeHtml(String(id)) + '</code></td><td class="text-center">' +
                '<button type="button" class="btn btn-sm btn-alt-secondary me-1 btn-edit-employee-chat-id" data-index="' + i + '" title="' + (tr.edit || 'Edit') + '"><i class="fa fa-pencil-alt"></i></button>' +
                '<button type="button" class="btn btn-sm btn-alt-danger btn-delete-employee-chat-id" data-index="' + i + '" title="' + (tr.delete || 'Delete') + '"><i class="fa fa-trash"></i></button>' +
                '</td></tr>';
        }).join(''));
    }

    function loadManagementChatIds() {
        $.ajax({
            url: '/telegramAPI/management-chat-ids',
            method: 'GET',
            success: function (data) {
                managementChatIdsList = Array.isArray(data.chatIds) ? data.chatIds : [];
                renderManagementChatIdsTable();
            },
            error: function () {
                managementChatIdsList = [];
                renderManagementChatIdsTable();
            }
        });
    }

    function renderManagementChatIdsTable() {
        const tbody = $('#management-chat-ids-tbody');
        const emptyEl = $('#management-chat-ids-empty');
        const tr = translations();
        if (!managementChatIdsList.length) {
            tbody.html('');
            emptyEl.show();
            return;
        }
        emptyEl.hide();
        tbody.html(managementChatIdsList.map(function (id, i) {
            return '<tr><td>' + (i + 1) + '</td><td><code>' + escapeHtml(String(id)) + '</code></td><td class="text-center">' +
                '<button type="button" class="btn btn-sm btn-alt-secondary me-1 btn-edit-management-chat-id" data-index="' + i + '" title="' + (tr.edit || 'Edit') + '"><i class="fa fa-pencil-alt"></i></button>' +
                '<button type="button" class="btn btn-sm btn-alt-danger btn-delete-management-chat-id" data-index="' + i + '" title="' + (tr.delete || 'Delete') + '"><i class="fa fa-trash"></i></button>' +
                '</td></tr>';
        }).join(''));
    }

    function reloadData() {
        $.ajax({
            url: '/telegramAPI_data',
            method: 'GET',
            success: function (data) {
                if (data && data.length > 0) {
                    const row = data[0];
                    update_telegramAPI(row.IDNo, row.TELEGRAM_API);
                }
                loadBotDetails();
                loadChatIds();
                loadEmployeeChatIds();
                loadManagementChatIds();
            },
            error: function (xhr, status, error) {
                console.error('Error fetching data:', error);
            }
        });
    }

    function update_telegramAPI(id, telegramAPI) {
        telegramAPI_id = id;
        $('#telegramAPI').val(telegramAPI);
    }

    $('#update_telegramAPI').submit(function (event) {
        event.preventDefault();

        var formData = $(this).serialize();
        $.ajax({
            url: '/telegramAPI/' + telegramAPI_id,
            type: 'PUT',
            data: formData,
            success: function (response) {
                const translations = window.telegramAPITranslations || {};
                Swal.fire({
                    title: translations.success || 'Success!',
                    text: translations.updated_successfully || 'Telegram API updated successfully',
                    icon: 'success',
                    confirmButtonText: translations.ok || 'OK'
                }).then(() => {
                    reloadData();
                });
            },
            error: function (error) {
                const translations = window.telegramAPITranslations || {};
                Swal.fire({
                    title: translations.error_title || 'Error!',
                    text: translations.failed_to_update || 'Failed to update Telegram API. Please try again.',
                    icon: 'error',
                    confirmButtonText: translations.ok || 'OK'
                });
                console.error('Error updating Telegram API:', error);
            }
        });
    });

    // Chat IDs: Add
    $('#btn-add-chat-id').on('click', function () {
        chatIdEditIndex = null;
        $('#modal-chat-id-label').text(translations().add_chat_id || 'Add Chat ID');
        $('#input-chat-id').val('');
        var modalEl = document.getElementById('modal-chat-id');
        if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
            new bootstrap.Modal(modalEl).show();
        } else {
            $(modalEl).modal('show');
        }
    });

    $('#btn-save-chat-id').on('click', function () {
        var val = ($('#input-chat-id').val() || '').trim();
        if (!val) {
            Swal.fire({ title: translations().error_title || 'Error', text: translations().enter_chat_id || 'Enter a Chat ID.', icon: 'warning' });
            return;
        }
        if (chatIdEditIndex === null) {
            chatIdsList.push(val);
        } else {
            chatIdsList[chatIdEditIndex] = val;
        }
        $.ajax({
            url: '/telegramAPI/chat-ids',
            type: 'PUT',
            contentType: 'application/json',
            data: JSON.stringify({ chatIds: chatIdsList }),
            success: function () {
                var modalEl = document.getElementById('modal-chat-id');
                if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
                    bootstrap.Modal.getInstance(modalEl).hide();
                } else {
                    $(modalEl).modal('hide');
                }
                Swal.fire({ title: translations().success || 'Success', text: translations().saved || 'Saved.', icon: 'success' });
                loadChatIds();
            },
            error: function () {
                Swal.fire({ title: translations().error_title || 'Error', text: translations().failed_to_update || 'Failed to save.', icon: 'error' });
            }
        });
    });

    // Chat IDs: Edit / Delete (delegate)
    $(document).on('click', '.btn-edit-chat-id', function () {
        var i = parseInt($(this).data('index'), 10);
        if (isNaN(i) || i < 0 || i >= chatIdsList.length) return;
        chatIdEditIndex = i;
        $('#modal-chat-id-label').text(translations().edit_chat_id || 'Edit Chat ID');
        $('#input-chat-id').val(chatIdsList[i]);
        var modalEl = document.getElementById('modal-chat-id');
        if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
            new bootstrap.Modal(modalEl).show();
        } else {
            $(modalEl).modal('show');
        }
    });

    $(document).on('click', '.btn-delete-chat-id', function () {
        var i = parseInt($(this).data('index'), 10);
        if (isNaN(i) || i < 0 || i >= chatIdsList.length) return;
        var tr = translations();
        Swal.fire({
            title: tr.delete_chat_id || 'Delete Chat ID?',
            text: tr.delete_chat_id_confirm || 'This chat will no longer receive notifications.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: tr.delete || 'Delete',
            cancelButtonText: tr.cancel || 'Cancel'
        }).then(function (result) {
            if (!result.isConfirmed) return;
            chatIdsList.splice(i, 1);
            $.ajax({
                url: '/telegramAPI/chat-ids',
                type: 'PUT',
                contentType: 'application/json',
                data: JSON.stringify({ chatIds: chatIdsList }),
                success: function () {
                    Swal.fire({ title: tr.success || 'Success', text: tr.deleted || 'Deleted.', icon: 'success' });
                    loadChatIds();
                },
                error: function () {
                    Swal.fire({ title: tr.error_title || 'Error', text: tr.failed_to_update || 'Failed to delete.', icon: 'error' });
                }
            });
        });
    });

    // Employee Chat IDs: Add
    $('#btn-add-employee-chat-id').on('click', function () {
        employeeChatIdEditIndex = null;
        $('#modal-employee-chat-id-label').text(translations().add_employee_chat_id || 'Add Employee Chat ID');
        $('#input-employee-chat-id').val('');
        var modalEl = document.getElementById('modal-employee-chat-id');
        if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
            new bootstrap.Modal(modalEl).show();
        } else {
            $(modalEl).modal('show');
        }
    });

    $('#btn-save-employee-chat-id').on('click', function () {
        var val = ($('#input-employee-chat-id').val() || '').trim();
        if (!val) {
            Swal.fire({ title: translations().error_title || 'Error', text: translations().enter_employee_chat_id || 'Enter an Employee Chat ID.', icon: 'warning' });
            return;
        }
        if (employeeChatIdEditIndex === null) {
            employeeChatIdsList.push(val);
        } else {
            employeeChatIdsList[employeeChatIdEditIndex] = val;
        }
        $.ajax({
            url: '/telegramAPI/employee-chat-ids',
            type: 'PUT',
            contentType: 'application/json',
            data: JSON.stringify({ chatIds: employeeChatIdsList }),
            success: function () {
                var modalEl = document.getElementById('modal-employee-chat-id');
                if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
                    bootstrap.Modal.getInstance(modalEl).hide();
                } else {
                    $(modalEl).modal('hide');
                }
                Swal.fire({ title: translations().success || 'Success', text: translations().saved || 'Saved.', icon: 'success' });
                loadEmployeeChatIds();
            },
            error: function () {
                Swal.fire({ title: translations().error_title || 'Error', text: translations().failed_to_update || 'Failed to save.', icon: 'error' });
            }
        });
    });

    // Employee Chat IDs: Edit / Delete (delegate)
    $(document).on('click', '.btn-edit-employee-chat-id', function () {
        var i = parseInt($(this).data('index'), 10);
        if (isNaN(i) || i < 0 || i >= employeeChatIdsList.length) return;
        employeeChatIdEditIndex = i;
        $('#modal-employee-chat-id-label').text(translations().edit_employee_chat_id || 'Edit Employee Chat ID');
        $('#input-employee-chat-id').val(employeeChatIdsList[i]);
        var modalEl = document.getElementById('modal-employee-chat-id');
        if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
            new bootstrap.Modal(modalEl).show();
        } else {
            $(modalEl).modal('show');
        }
    });

    $(document).on('click', '.btn-delete-employee-chat-id', function () {
        var i = parseInt($(this).data('index'), 10);
        if (isNaN(i) || i < 0 || i >= employeeChatIdsList.length) return;
        var tr = translations();
        Swal.fire({
            title: tr.delete_employee_chat_id || 'Delete Employee Chat ID?',
            text: tr.delete_employee_chat_id_confirm || 'This employee chat will no longer receive notifications.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: tr.delete || 'Delete',
            cancelButtonText: tr.cancel || 'Cancel'
        }).then(function (result) {
            if (!result.isConfirmed) return;
            employeeChatIdsList.splice(i, 1);
            $.ajax({
                url: '/telegramAPI/employee-chat-ids',
                type: 'PUT',
                contentType: 'application/json',
                data: JSON.stringify({ chatIds: employeeChatIdsList }),
                success: function () {
                    Swal.fire({ title: tr.success || 'Success', text: tr.deleted || 'Deleted.', icon: 'success' });
                    loadEmployeeChatIds();
                },
                error: function () {
                    Swal.fire({ title: tr.error_title || 'Error', text: tr.failed_to_update || 'Failed to delete.', icon: 'error' });
                }
            });
        });
    });

    // Management Chat IDs: Add
    $('#btn-add-management-chat-id').on('click', function () {
        managementChatIdEditIndex = null;
        $('#modal-management-chat-id-label').text(translations().add_management_chat_id || 'Add Management Chat ID');
        $('#input-management-chat-id').val('');
        var modalEl = document.getElementById('modal-management-chat-id');
        if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
            new bootstrap.Modal(modalEl).show();
        } else {
            $(modalEl).modal('show');
        }
    });

    $('#btn-save-management-chat-id').on('click', function () {
        var val = ($('#input-management-chat-id').val() || '').trim();
        if (!val) {
            Swal.fire({ title: translations().error_title || 'Error', text: translations().enter_management_chat_id || 'Enter a Management Chat ID.', icon: 'warning' });
            return;
        }
        if (managementChatIdEditIndex === null) {
            managementChatIdsList.push(val);
        } else {
            managementChatIdsList[managementChatIdEditIndex] = val;
        }
        $.ajax({
            url: '/telegramAPI/management-chat-ids',
            type: 'PUT',
            contentType: 'application/json',
            data: JSON.stringify({ chatIds: managementChatIdsList }),
            success: function () {
                var modalEl = document.getElementById('modal-management-chat-id');
                if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
                    bootstrap.Modal.getInstance(modalEl).hide();
                } else {
                    $(modalEl).modal('hide');
                }
                Swal.fire({ title: translations().success || 'Success', text: translations().saved || 'Saved.', icon: 'success' });
                loadManagementChatIds();
            },
            error: function () {
                Swal.fire({ title: translations().error_title || 'Error', text: translations().failed_to_update || 'Failed to save.', icon: 'error' });
            }
        });
    });

    // Management Chat IDs: Edit / Delete (delegate)
    $(document).on('click', '.btn-edit-management-chat-id', function () {
        var i = parseInt($(this).data('index'), 10);
        if (isNaN(i) || i < 0 || i >= managementChatIdsList.length) return;
        managementChatIdEditIndex = i;
        $('#modal-management-chat-id-label').text(translations().edit_management_chat_id || 'Edit Management Chat ID');
        $('#input-management-chat-id').val(managementChatIdsList[i]);
        var modalEl = document.getElementById('modal-management-chat-id');
        if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
            new bootstrap.Modal(modalEl).show();
        } else {
            $(modalEl).modal('show');
        }
    });

    $(document).on('click', '.btn-delete-management-chat-id', function () {
        var i = parseInt($(this).data('index'), 10);
        if (isNaN(i) || i < 0 || i >= managementChatIdsList.length) return;
        var tr = translations();
        Swal.fire({
            title: tr.delete_management_chat_id || 'Delete Management Chat ID?',
            text: tr.delete_management_chat_id_confirm || 'This management chat will no longer receive notifications.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: tr.delete || 'Delete',
            cancelButtonText: tr.cancel || 'Cancel'
        }).then(function (result) {
            if (!result.isConfirmed) return;
            managementChatIdsList.splice(i, 1);
            $.ajax({
                url: '/telegramAPI/management-chat-ids',
                type: 'PUT',
                contentType: 'application/json',
                data: JSON.stringify({ chatIds: managementChatIdsList }),
                success: function () {
                    Swal.fire({ title: tr.success || 'Success', text: tr.deleted || 'Deleted.', icon: 'success' });
                    loadManagementChatIds();
                },
                error: function () {
                    Swal.fire({ title: tr.error_title || 'Error', text: tr.failed_to_update || 'Failed to delete.', icon: 'error' });
                }
            });
        });
    });

    // Load data on page load
    reloadData();
    loadBotDetails();
    loadChatIds();
    loadEmployeeChatIds();
    loadManagementChatIds();
});

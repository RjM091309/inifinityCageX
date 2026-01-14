document.addEventListener('DOMContentLoaded', function() {
    // Hanapin ang reset link sa sidebar file
    const resetLink = document.getElementById('sidebarResetLink');

    if (resetLink) {
        resetLink.addEventListener('click', function (event) {
            event.preventDefault(); // Iwasang mag-redirect

            // Step 1: Magpakita ng password prompt
            Swal.fire({
                icon: 'info',
                title: 'Are you sure?',
                text: 'If you enter the manager password, it will proceed to reset the data.',
                input: 'password',
                inputPlaceholder: 'Password',
                showCancelButton: true,
                confirmButtonText: 'Submit',
                confirmButtonColor: '#3A57E8',
                preConfirm: (password) => {
                    return new Promise((resolve, reject) => {
                        $.ajax({
                            url: '/verify-password',
                            type: 'POST',
                            data: { password: password },
                            success: function(response) {
                                if (response.permissions === 11) {
                                    resolve(); // Magpatuloy kung permission = 11
                                } else {
                                    Swal.showValidationMessage('Incorrect password.');
                                    reject();
                                }
                            },
                            error: function() {
                                Swal.showValidationMessage('Error during password verification.');
                                reject();
                            }
                        });
                    });
                },
                allowOutsideClick: () => !Swal.isLoading()
            }).then((result) => {
                if (result.isConfirmed) {
                    // Step 2: Ipakita ang progress bar
                    Swal.fire({
                        title: 'Resetting...',
                        html: `
                            <div class="progress">
                                <div id="progress-bar" class="progress-bar" role="progressbar" style="width: 1%; height: 20px; background-color: #3A57E8;"></div>
                            </div>
                            <p id="progress-percent">1%</p>
                        `,
                        allowOutsideClick: false,
                        showConfirmButton: false,
                        didOpen: () => {
                            let progress = 1;
                            const interval = setInterval(() => {
                                progress += 1;
                                document.getElementById('progress-bar').style.width = `${progress}%`;
                                document.getElementById('progress-percent').textContent = `${progress}%`;

                                if (progress >= 100) {
                                    clearInterval(interval);
                                    
                                    // Step 3: I-submit muna ang form data sa /insert-dash-history gamit ang AJAX
                                    const form = document.getElementById('expense-form');
                                    const formData = new URLSearchParams();
                                    for (const pair of new FormData(form)) {
                                        formData.append(pair[0], pair[1]);
                                    }
                                    
                                    fetch('/insert-dash-history', {
                                        method: 'POST',
                                        headers: {
                                            'Content-Type': 'application/x-www-form-urlencoded'
                                        },
                                        body: formData
                                    })
                                    .then(response => {
                                        if (!response.ok) {
                                            throw new Error('Network response was not ok');
                                        }
                                        return response.json();
                                    })
                                    .then(insertData => {
                                        if (insertData.success) {
                                            // Step 4: Pagkatapos, tawagin ang reset endpoint
                                            fetch('/reset-main-cage-balance', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' }
                                            })
                                            .then(response => {
                                                if (!response.ok) {
                                                    throw new Error('Network response was not ok');
                                                }
                                                return response.json();
                                            })
                                            .then(resetData => {
                                                if (resetData.success) {
                                                    // Close the progress bar modal first
                                                    Swal.close();
                                                    
                                                    // Then show the success message
                                                    Swal.fire({
                                                        icon: 'success',
                                                        title: 'Monthly Reset Completed',
                                                        text: 'Data has been reset!',
                                                        showConfirmButton: true
                                                    }).then(() => {
                                                        // Direktang i-redirect sa dashboard pagkatapos mag-click ng OK
                                                        window.location.href = '/dashboard_history';
                                                    });

                                                    // Optional: I-update ang mga frontend values bilang 0
                                                    document.getElementById('expense').textContent = (0).toLocaleString();
                                                    document.getElementById('totalrolling').textContent = (0).toLocaleString();
                                                    document.getElementById('totalhouserolling').textContent = (0).toLocaleString();
                                                    document.getElementById('winloss').textContent = (0).toLocaleString();
                                                    document.getElementById('comms').textContent = (0).toLocaleString();
                                                } else {
                                                    throw new Error('Reset failed');
                                                }
                                            })
                                            .catch(error => Swal.fire({
                                                icon: 'error',
                                                title: 'Error',
                                                text: 'Failed to reset values. Please try again.',
                                                showConfirmButton: true
                                            }));
                                        } else {
                                            Swal.fire({
                                                icon: 'error',
                                                title: 'Error',
                                                text: 'Failed to insert history.',
                                                showConfirmButton: true
                                            });
                                        }
                                    })
                                    .catch(error => Swal.fire({
                                        icon: 'error',
                                        title: 'Error',
                                        text: 'Failed to insert history.',
                                        showConfirmButton: true
                                    }));
                                }
                            }, 30);
                        }
                    });
                }
            });
        });
    }
});

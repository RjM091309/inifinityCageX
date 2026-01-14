

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
                confirmButtonColor: '#6f9c40',
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
                    // Step 2: Kung tama ang password, simulan ang inserting at resetting
                    Swal.fire({
                        title: 'Resetting...',
                        html: `
                            <div class="progress">
                                <div id="progress-bar" class="progress-bar" role="progressbar" style="width: 1%; height: 20px; background-color: #6f9c40;"></div>
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

                                if (progress === 100) {
                                    clearInterval(interval);

                                    // Step 3: I-submit ang form na nasa main content
                                    const form = document.getElementById('expense-form');
                                    if (form) {
                                        form.submit();
                                    }

                                    // Step 4: Magpadala ng AJAX request para sa pag-reset ng mga values
                                    fetch('/reset-main-cage-balance', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' }
                                    })
                                    .then(response => response.ok ? response.json() : Promise.reject())
                                    .then(data => {
                                        if (data.success) {
                                            Swal.fire({
                                                icon: 'success',
                                                title: 'Monthly Reset Completed',
                                                text: 'Data has been reset!',
                                                showConfirmButton: true
                                            });

                                            // I-update ang mga values sa frontend bilang 0
                                            document.getElementById('expense').textContent = (0).toLocaleString();
                                            document.getElementById('totalrolling').textContent = (0).toLocaleString();
                                            document.getElementById('totalhouserolling').textContent = (0).toLocaleString();
                                            document.getElementById('winloss').textContent = (0).toLocaleString();
                                            document.getElementById('comms').textContent = (0).toLocaleString();
                                            document.getElementById('ngr').textContent = (0).toLocaleString();
                                        }
                                    })
                                    .catch(error => Swal.fire({
                                        icon: 'error',
                                        title: 'Error',
                                        text: 'Failed to reset values. Please try again.',
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

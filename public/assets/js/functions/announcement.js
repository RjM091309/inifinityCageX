// Announcement functionality
document.addEventListener('DOMContentLoaded', function() {
	const form = document.getElementById('form-new-announcement');
	const messageInput = document.getElementById('announcement-message');
	const pictureInput = document.getElementById('announcement-picture');
	const picturePreview = document.getElementById('picture-preview');
	const picturePreviewContainer = document.getElementById('picture-preview-container');
	const removePictureBtn = document.getElementById('remove-picture-btn');
	const submitBtn = document.getElementById('submit-announcement-btn');
	const modal = document.getElementById('modal-new-announcement');

	// Picture preview functionality
	if (pictureInput) {
		pictureInput.addEventListener('change', function(e) {
			const file = e.target.files[0];
			if (file) {
				const reader = new FileReader();
				reader.onload = function(e) {
					picturePreview.src = e.target.result;
					picturePreviewContainer.classList.remove('d-none');
				};
				reader.readAsDataURL(file);
			}
		});
	}

	// Remove picture
	if (removePictureBtn) {
		removePictureBtn.addEventListener('click', function() {
			pictureInput.value = '';
			picturePreview.src = '';
			picturePreviewContainer.classList.add('d-none');
		});
	}

	// Reset modal when it closes
	if (modal) {
		modal.addEventListener('hidden.bs.modal', function() {
			form.reset();
			picturePreview.src = '';
			picturePreviewContainer.classList.add('d-none');
			if (submitBtn) submitBtn.disabled = false;
		});
	}

	// Form submission
	if (form) {
		form.addEventListener('submit', async function(e) {
			e.preventDefault();

			const message = messageInput.value.trim();
			const hasPicture = pictureInput.files[0];
			
			var t = window.announcementModalTranslations || {};
			// At least one of message or picture must be provided
			if (!message && !hasPicture) {
				Swal.fire({
					icon: 'error',
					title: t.validation_error || 'Validation Error',
					text: t.please_enter_message_or_picture || 'Please enter a message or upload a picture'
				});
				return;
			}

			// Disable submit button
			if (submitBtn) submitBtn.disabled = true;
			submitBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> ' + (t.sending || 'Sending...');

			try {
				const formData = new FormData();
				formData.append('message', message);
				
				if (pictureInput.files[0]) {
					formData.append('picture', pictureInput.files[0]);
				}

				const response = await fetch('/announcement/create', {
					method: 'POST',
					body: formData
				});

				// Check if response is ok
				if (!response.ok) {
					let errorMessage = t.failed_to_send || 'Failed to send announcement';
					try {
						const errorData = await response.json();
						errorMessage = errorData.error || errorMessage;
					} catch (e) {
						errorMessage = `Server error: ${response.status} ${response.statusText}`;
					}
					throw new Error(errorMessage);
				}

				const result = await response.json();

				if (result.success) {
					Swal.fire({
						icon: 'success',
						title: t.success || 'Success!',
						text: result.message,
						timer: 3000,
						showConfirmButton: false
					});

					// Close modal and reset form
					const modalInstance = bootstrap.Modal.getInstance(modal);
					if (modalInstance) {
						modalInstance.hide();
					}

					// Reset button state
					if (submitBtn) {
						submitBtn.disabled = false;
						submitBtn.innerHTML = '<i class="fa fa-paper-plane"></i> ' + (t.send_announcement || 'Send Announcement');
					}
				} else {
					Swal.fire({
						icon: 'error',
						title: t.error || 'Error',
						text: result.error || (t.failed_to_send || 'Failed to send announcement')
					});
					if (submitBtn) {
						submitBtn.disabled = false;
						submitBtn.innerHTML = '<i class="fa fa-paper-plane"></i> ' + (t.send_announcement || 'Send Announcement');
					}
				}
			} catch (error) {
				console.error('Error:', error);
				Swal.fire({
					icon: 'error',
					title: t.error || 'Error',
					text: error.message || (t.error_occurred || 'An error occurred while sending the announcement')
				});
				if (submitBtn) {
					submitBtn.disabled = false;
					submitBtn.innerHTML = '<i class="fa fa-paper-plane"></i> ' + (t.send_announcement || 'Send Announcement');
				}
			}
		});
	}
});


var booking_id;

function addBooking() {
  $('#modal-new-booking').modal('show');
}

$(document).ready(function() {
  if ($.fn.DataTable.isDataTable('#booking-tbl')) {
      $('#booking-tbl').DataTable().destroy();
  }

  var dataTable = $('#booking-tbl').DataTable({
    "order": [[2, 'desc']], // Order by booking date
    "columnDefs": [
      {
        "targets": 2, // Column index for the ENCODED_DT
       
        "createdCell": function (cell, cellData, rowData, rowIndex, colIndex) {
          $(cell).addClass('text-center');
        }
      }
    ]
});


function reloadData() {
    $.ajax({
        url: '/junket_booking_data', // Replace with actual endpoint
        method: 'GET',
        success: function(data) {
            dataTable.clear();

            data.forEach(function(row) {
                // Booking Date: formatted as Date + Time (with hour and minute)
                var bookingDate = row.BOOKING_DATE ? 
                    moment(row.BOOKING_DATE).utcOffset(8).format('MMMM DD, YYYY HH:mm:ss') : // Booking Date with time
                    moment().format('MMMM DD, YYYY HH:mm:ss');

                // Check-In date: formatted for display (remove time)
                var checkInDateFormatted = (row.CHECK_IN && moment(row.CHECK_IN, moment.ISO_8601, true).isValid()) ?
                    `<span style="color: #00563F;">${moment(row.CHECK_IN).utcOffset(8).format('MMMM DD, YYYY')} <span class="badge" style="background-color: #00563F;">Check-In</span></span>` :
                    '-';

                // Check-In date for input (remove time)
                var checkInDate = (row.CHECK_IN && moment(row.CHECK_IN, moment.ISO_8601, true).isValid()) ?
                    moment(row.CHECK_IN).utcOffset(8).format('YYYY-MM-DD') : // Date only for input (no time)
                    '-';

                // Check-Out date: formatted for display (remove time)
                var checkOutDateFormatted = (row.CHECK_OUT && moment(row.CHECK_OUT, moment.ISO_8601, true).isValid()) ?
                    `<span style="color: orange;">${moment(row.CHECK_OUT).utcOffset(8).format('MMMM DD, YYYY')} <span class="badge bg-warning">Check-Out</span></span>` :
                    '-';

                // Check-Out date for input (remove time)
                var checkOutDate = (row.CHECK_OUT && moment(row.CHECK_OUT, moment.ISO_8601, true).isValid()) ?
                    moment(row.CHECK_OUT).utcOffset(8).format('YYYY-MM-DD') : // Date only for input (no time)
                    '-';

                // Format fees and total amount
                var hotelFee = row.HOTEL_FEE ? parseFloat(row.HOTEL_FEE).toLocaleString() : '0';
                var addFee = row.ADDT_FEE ? parseFloat(row.ADDT_FEE).toLocaleString() : '0';
                var totalAmount = row.TOTAL_AMOUNT ? parseFloat(row.TOTAL_AMOUNT).toLocaleString() : '0';

                // Payment Status badge with different colors based on status
                var paymentStatusBadge;
                if (row.PAYMENT_STATUS === 'Paid') {
                    paymentStatusBadge = `<span class="css-blue">Paid</span>`;
                } else if (row.PAYMENT_STATUS === 'Unpaid') {
                    paymentStatusBadge = `<span class="css-red">Unpaid</span>`;
                } else {
                    paymentStatusBadge = `<span class="badge bg-secondary">Unknown</span>`; // Fallback if status is neither 'Paid' nor 'Unpaid'
                }

                // Button options in your DataTable
                const permissions = parseInt($('#user-role').data('permissions')); // Get permissions dynamically

                let btn = '';

                if (permissions !== 2) {
                    // Fully enabled dropdown options for other permissions
                    btn = `<center>
                                <div class="btn-group">
                                    <button type="button" class="btn btn-sm btn-alt-secondary dropdown-toggle" style="background-color: #00563F;" data-bs-toggle="dropdown" aria-expanded="false">
                                        <i class="fa fa-ellipsis-h" style="color: white; background-color: transparent;"></i>
                                    </button>
                                    <ul class="dropdown-menu dropdown-menu-end"> 
                                        <li><button class="dropdown-item" onclick="checkIn(${row.IDNo})">Check-In</button></li>
                                        <li><button class="dropdown-item" onclick="checkOut(${row.IDNo})">Checkout</button></li>
                                        <li><button class="dropdown-item" onclick="togglePaymentStatus(${row.IDNo}, '${row.PAYMENT_STATUS}')">Mark as ${row.PAYMENT_STATUS === 'Paid' ? 'Unpaid' : 'Paid'}</button></li>
                                        <li><button class="dropdown-item" onclick="editBooking(${row.IDNo}, '${row.CONFIRM_NUM.replace(/'/g, "\\'")}', '${checkInDate}', '${checkOutDate}', '${row.GUEST_NAME.replace(/'/g, "\\'")}', '${hotelFee}', '${addFee}', '${row.REMARKS.replace(/'/g, "\\'")}')">Edit</button></li>
                                        <li><button class="dropdown-item" onclick="archiveBooking(${row.IDNo})">Archive</button></li>
                                    </ul>
                                </div>
                            </center>`;
                } else {
                    // Disable all dropdown options for permissions = 2
                    btn = `<center>
                                <div class="btn-group">
                                    <button type="button" class="btn btn-sm btn-alt-secondary dropdown-toggle" style="background-color: #00563F;" data-bs-toggle="dropdown" aria-expanded="false" disabled>
                                        <i class="fa fa-ellipsis-h" style="color: white; background-color: transparent;"></i>
                                    </button>
                                </div>
                            </center>`;
                }


                // Add row to the DataTable
                dataTable.row.add([
                    bookingDate, // Booking Date with time
                    row.CONFIRM_NUM,
                    checkInDateFormatted, // Check-In date (Date only, no time)
                    checkOutDateFormatted, // Check-Out date (Date only, no time)
                    row.ACCT_NUM,
                    row.GUEST_NAME,
                    hotelFee,
                    addFee,
                    totalAmount,
                    paymentStatusBadge, // Display badge instead of plain text
                    row.REMARKS,
                    row.FIRSTNAME,
                    btn
                ]).draw();    
            });
        },
        error: function(xhr, status, error) {
            console.error("Error fetching booking data: ", error);
        }
    });
}




  reloadData();

 // Add new booking
 $('#add_booking_form').submit(function(event) {
  event.preventDefault();

  var isValid = true;
  $(this).find(':input[required]').each(function() {
      if ($(this).val() === '') {
          isValid = false;
          $(this).addClass('is-invalid');
      } else {
          $(this).removeClass('is-invalid');
      }
  });

  if (!isValid) {
      Swal.fire({
          icon: 'error',
          title: 'Inserting Error',
          text: 'Please fill in all required fields.',
      });
      return; 
  }

  var formData = $(this).serialize();

  $.ajax({
      url: '/add_junket_booking', // Update this to your correct endpoint
      type: 'POST',
      data: formData,
      success: function(response) {
          Swal.fire({
              icon: 'success',
              title: 'Booking added successfully',
              confirmButtonText: 'OK',
              showConfirmButton: true
          }).then(function() {
              reloadData();
              $('#modal-new-booking').modal('hide');
              window.location.reload();
          });
      },
      error: function(xhr, status, error) {
          console.error('Error adding booking:', error);
      }
  });
});

// Handle form EDIT submission
$('#editBookingForm').on('submit', function(e) {
    e.preventDefault();
    const formData = $(this).serialize();
    
    // Update booking data via AJAX
    $.ajax({
        url: '/update_junket_booking', // Replace with actual endpoint for updating booking
        method: 'POST',
        data: formData,
        success: function(response) {
            // Fire SweetAlert notification for successful update
            Swal.fire({
                icon: 'success',
                title: 'Updated Successfully',
                text: 'The booking has been updated.',
                confirmButtonText: 'OK' // Show "OK" button
            }).then((result) => {
                if (result.isConfirmed) {
                    // When OK button is clicked, close the modal and reload DataTable
                    $('#modal-edit-booking').modal('hide'); // Hide the modal
                    // reloadData(); // Reload the DataTable
                     window.location.reload();
                }
            });
        },
        error: function(xhr, status, error) {
            console.error('Error updating booking:', error);
        }
    });
});
});

//EDIT BOOKING
function editBooking(id, confirmNum, checkIn, checkOut, guestName, hotelFee, addFee, remarks) {
  
  // Show the modal
  $('#modal-edit-booking').modal('show');
  
  // Populate the modal fields with the existing booking data
  $('#bookingId').val(id);
  $('#confirmNum').val(confirmNum);
  $('#checkIn').val(checkIn);
  $('#checkOut').val(checkOut);
  $('#guestName').val(guestName);
  $('#hotelFee').val(hotelFee);  // Ensure hotelFee is populated
  $('#addFee').val(addFee);      // Ensure addFee is populated
  $('#remarks').val(remarks);
  
  // Calculate total based on populated fees
  calculateTotal();  // Call the function to calculate the total when opening the modal

}


//ARCHIVE BOOKING
function archiveBooking(id) {
  Swal.fire({
      title: 'Are you sure you want to archive this booking?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Yes, archive it!'
  }).then((result) => {
      if (result.isConfirmed) {
          $.ajax({
              url: '/remove_booking/' + id, // Endpoint for archiving booking
              type: 'PUT',
              success: function(response) {
                  Swal.fire({
                      icon: 'success',
                      title: 'Booking archived successfully',
                      confirmButtonText: 'OK'
                  }).then(() => {
                      window.location.reload(); // Reload the page to reflect the changes
                  });
              },
              error: function(error) {
                  console.error('Error archiving booking:', error);
                  Swal.fire({
                      icon: 'error',
                      title: 'Error archiving booking',
                      text: 'An error occurred while archiving the booking.',
                  });
              }
          });
      }
  });
}


//CHECK IN CONFIRMATION
function checkIn(bookingId) {
  Swal.fire({
      title: 'Are you sure?',
      text: 'Do you want to check in this booking?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, check in!',
      cancelButtonText: 'No, cancel'
  }).then((result) => {
      if (result.isConfirmed) {
          const currentDateTime = moment().format('YYYY-MM-DD HH:mm:ss');
          $.ajax({
              url: `/check_in/${bookingId}`, // Endpoint for check-in
              method: 'PUT',
              data: { checkInDate: currentDateTime },
              success: function(response) {
                  Swal.fire({
                      icon: 'success',
                      title: 'Checked in successfully',
                      confirmButtonText: 'OK'
                  }).then(function() {
                      window.location.reload(); // Reload the page to refresh the data
                  });
              },
              error: function(xhr, status, error) {
                  console.error('Error during check-in:', error);
              }
          });
      }
  });
}
//CHECK OUT CONFIRMATION
function checkOut(bookingId) {
  Swal.fire({
      title: 'Are you sure?',
      text: 'Do you want to check out this booking?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, check out!',
      cancelButtonText: 'No, cancel'
  }).then((result) => {
      if (result.isConfirmed) {
          const currentDateTime = moment().format('YYYY-MM-DD HH:mm:ss');
          $.ajax({
              url: `/check_out/${bookingId}`, // Endpoint for check-out
              method: 'PUT',
              data: { checkOutDate: currentDateTime },
              success: function(response) {
                  Swal.fire({
                      icon: 'success',
                      title: 'Checked out successfully',
                      confirmButtonText: 'OK'
                  }).then(function() {
                      window.location.reload(); // Reload the page to refresh the data
                  });
              },
              error: function(xhr, status, error) {
                  console.error('Error during check-out:', error);
              }
          });
      }
  });
}



// Toggle PAYMENT STATUS
function togglePaymentStatus(bookingId, currentStatus) {
    const newStatus = currentStatus === 'Paid' ? 'Unpaid' : 'Paid';
    Swal.fire({
      title: 'Update Payment Status',
      text: `Do you want to mark this booking as ${newStatus}?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: `Yes, mark as ${newStatus}`,
      cancelButtonText: 'No, cancel'
    }).then((result) => {
      if (result.isConfirmed) {
        $.ajax({
          url: `/booking_payment_status_update/${bookingId}`, // Endpoint for toggling payment status
          method: 'PUT',
          data: { paymentStatus: newStatus },
          success: function(response) {
            Swal.fire({
              icon: 'success',
              title: `Marked as ${newStatus} successfully`,
              confirmButtonText: 'OK'
            }).then(function() {
              window.location.reload(); // Reload the page to refresh the data
            });
          },
          error: function(xhr, status, error) {
            console.error('Error updating payment status:', error);
          }
        });
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
})

function onlyNumberKey(evt) {

  let ASCIICode = (evt.which) ? evt.which : evt.keyCode
  if (ASCIICode > 31 && (ASCIICode < 48 || ASCIICode > 57))
    return false;
  return true;
}
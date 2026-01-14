var booking_id;

// Function para buksan ang modal para sa bagong booking
function addBooking() {
    $('#modal-new-booking').modal('show');
  }
  
  // Utility function para makuha ang query parameter mula sa URL
  function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
  }
  
  $(document).ready(function () {
    // Kunin ang booking ID na dapat i-highlight mula sa URL (hal., /booking?id=8)
    const highlightId = getQueryParam('id');
    console.log("Highlight ID from URL:", highlightId);
  
    // Siguraduhing na-destroy muna ang anumang existing DataTable instance
    if ($.fn.DataTable.isDataTable('#booking-tbl')) {
      $('#booking-tbl').DataTable().destroy();
    }
  
    // I-initialize ang DataTable. Tandaan: gagamit tayo ng object na ito sa pagre-load ng data.
    var dataTable = $('#booking-tbl').DataTable({
      responsive: true,
      ordering: true,
      pageLength: 10,
      // Itago ang booking ID column (na nasa index 0)
      columnDefs: [
        { targets: 0, visible: false, searchable: false }
      ],
      // Order ayon sa Booking Date na nasa index 1 (dahil nadagdag na ang booking ID sa index 0)
      order: [[1, 'desc']],
      // Sa createdRow, ilagay ang highlight kung magmamatch ang booking ID (data[0]) sa highlightId
      createdRow: function (row, data, dataIndex) {
        var rowId = data[0];
        console.log("Row ID:", rowId, "Highlight ID:", highlightId);
        if (highlightId && parseInt(rowId) === parseInt(highlightId)) {
          console.log("Highlighting row:", row);
          // Gamitin ang addClass para idagdag ang highlight, at hindi na muna diretso ang inline style
          $(row).addClass('highlight-row');
        }
      },
      // drawCallback: paglipat ng pahina, i-scroll sa highlighted row kung meron
      drawCallback: function (settings) {
        const api = this.api();
        const $currentRows = $(api.rows({ page: 'current' }).nodes());
        const $highlightRow = $currentRows.filter('.highlight-row');
        if ($highlightRow.length) {
          $('html, body').animate({
            scrollTop: $highlightRow.offset().top - 100
          }, 500);
        }
      }
    });
  
    // Function para i-load/muling i-reload ang booking data mula sa server
    function reloadData() {
      $.ajax({
        url: '/junket_booking_data', // Palitan ng tamang endpoint kung kinakailangan
        method: 'GET',
        success: function (data) {
          // Linisin muna ang DataTable bago idagdag ang mga bagong row
          dataTable.clear();
  
          // I-loop sa bawat row ng data
          data.forEach(function (row) {
            // Format ng booking date (kasama ang oras)
            var bookingDate = row.BOOKING_DATE ?
              moment(row.BOOKING_DATE).utcOffset(8).format('MMMM DD HH:mm') :
              moment().format('MMMM DD, HH:mm');
  
            // Format ng check-in at check-out dates
            var checkInDateFormatted = (row.CHECK_IN && moment(row.CHECK_IN, moment.ISO_8601, true).isValid()) ?
            `<div style="text-align: center;">
                <div style="color: #00563F;">${moment(row.CHECK_IN).utcOffset(8).format('MMM DD, YYYY')}</div>
                <span class="badge" style="background-color: #00563F;">Check-In</span>
             </div>` : '-';
          
          var checkOutDateFormatted = (row.CHECK_OUT && moment(row.CHECK_OUT, moment.ISO_8601, true).isValid()) ?
            `<div style="text-align: center;">
                <div style="color: orange;">${moment(row.CHECK_OUT).utcOffset(8).format('MMM DD, YYYY')}</div>
                <span class="badge bg-warning">Check-Out</span>
             </div>` : '-';
          
  
            // Format fees at total amounts
            var hotelFee = row.HOTEL_FEE ? parseFloat(row.HOTEL_FEE).toLocaleString() : '0';
            var addFee = row.ADDT_FEE ? parseFloat(row.ADDT_FEE).toLocaleString() : '0';
            var totalAmount = row.TOTAL_AMOUNT ? parseFloat(row.TOTAL_AMOUNT).toLocaleString() : '0';
  
            // Payment Status badge
            var paymentStatusBadge;
            if (row.PAYMENT_STATUS === 'Paid') {
              paymentStatusBadge = `<span class="css-blue">Paid</span>`;
            } else if (row.PAYMENT_STATUS === 'Unpaid') {
              paymentStatusBadge = `<span class="css-red">Unpaid</span>`;
            } else {
              paymentStatusBadge = `<span class="badge bg-secondary">Unknown</span>`;
            }
  
            // Button options depende sa user permissions
            const permissions = parseInt($('#user-role').data('permissions'));
            var btn = '';
            if (permissions !== 2) {
              btn = `<center>
                        <div class="btn-group">
                          <button type="button" class="btn btn-sm btn-primary dropdown-toggle" data-bs-toggle="dropdown" data-bs-boundary="viewport"  aria-expanded="false">
                            <i class="fa fa-ellipsis-h" style="color: white; background-color: transparent;"></i>
                          </button>
                          <ul class="dropdown-menu dropdown-menu-end">
                            <li><button class="dropdown-item" onclick="checkIn(${row.IDNo})">Check-In</button></li>
                            <li><button class="dropdown-item" onclick="checkOut(${row.IDNo})">Checkout</button></li>
                            <li><button class="dropdown-item" onclick="togglePaymentStatus(${row.IDNo}, '${row.PAYMENT_STATUS}')">Mark as ${row.PAYMENT_STATUS === 'Paid' ? 'Unpaid' : 'Paid'}</button></li>
                            <li><button class="dropdown-item" onclick="editBooking(${row.IDNo}, '${row.CONFIRM_NUM.replace(/'/g, "\\'")}', '${row.CHECK_IN}', '${row.CHECK_OUT}', '${row.GUEST_NAME.replace(/'/g, "\\'")}', '${hotelFee}', '${addFee}', '${row.REMARKS.replace(/'/g, "\\'")}')">Edit</button></li>
                            <li><button class="dropdown-item" onclick="archiveBooking(${row.IDNo})">Archive</button></li>
                          </ul>
                        </div>
                      </center>`;
            } else {
              btn = `<center>
                       <div class="btn-group">
                          <button type="button" class="btn btn-sm btn-alt-secondary dropdown-toggle" style="background-color: #f0f1f7;" data-bs-toggle="dropdown" aria-expanded="false" disabled>
                            <i class="fa fa-ellipsis-h" style="color: white; background-color: transparent;"></i>
                          </button>
                        </div>
                      </center>`;
            }
  
            // Idagdag ang row sa DataTable.
            // Isama natin ang booking ID (row.IDNo) bilang unang item (index 0)
            dataTable.row.add([
              row.IDNo,              // Index 0: Booking ID (hidden)
              bookingDate,           // Index 1: Booking Date
              row.CONFIRM_NUM,       // Index 2: Confirmation No.
              checkInDateFormatted,  // Index 3: Check-In Date
              checkOutDateFormatted, // Index 4: Check-Out Date
              row.ACCT_NUM,          // Index 5: Account No.
              row.GUEST_NAME,        // Index 6: Guest Name
              hotelFee,              // Index 7: Hotel Fee
              addFee,                // Index 8: Additional Fee
              totalAmount,           // Index 9: Total Amount
              paymentStatusBadge,    // Index 10: Payment Status
              row.REMARKS,           // Index 11: Remarks
              row.FIRSTNAME,         // Index 12: Encoded By
              btn                    // Index 13: Action buttons
            ]);
          });
  
          // I-draw ang DataTable matapos madagdag lahat ng rows
          dataTable.draw();
  
          // Pagkatapos mag-draw, kung ang highlighted row ay nasa ibang pahina, ilipat ang DataTable sa tamang page.
          if (highlightId) {
            var allData = dataTable.rows().data().toArray();
            var targetIndex = -1;
            for (var i = 0; i < allData.length; i++) {
              if (parseInt(allData[i][0]) === parseInt(highlightId)) {
                targetIndex = i;
                break;
              }
            }
            if (targetIndex >= 0) {
              var pageLength = dataTable.page.len();
              var targetPage = Math.floor(targetIndex / pageLength);
              console.log("Target row index:", targetIndex, "Target page:", targetPage);
              if (dataTable.page() !== targetPage) {
                dataTable.page(targetPage).draw(false);
              }
            }
          }
        },
        error: function (xhr, status, error) {
          console.error("Error fetching booking data:", error);
        }
      });
    }
  
    // Tawagin ang reloadData para mapopulate ang table
    reloadData();

 // Add new booking
$('#add_booking_form').submit(function (event) {
    event.preventDefault();

    const $form = $(this);
    const $btn = $form.find('button[type="submit"]');
    const originalHtml = $btn.html();

    // Show loading spinner
    $btn.prop('disabled', true).html(`
        <span class="spinner-border spinner-border-sm me-1 text-white" role="status" aria-hidden="true"></span>
        <span class="text-white">Saving...</span>
    `);

    let isValid = true;
    $form.find(':input[required]').each(function () {
        if ($(this).val().trim() === '') {
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
        $btn.prop('disabled', false).html(originalHtml);
        return;
    }

    const formData = $form.serialize();

    $.ajax({
        url: '/add_junket_booking',
        type: 'POST',
        data: formData,
        success: function (response) {
            Swal.fire({
                icon: 'success',
                title: 'Booking added successfully',
                confirmButtonText: 'OK'
            }).then(function () {
                $('#modal-new-booking').modal('hide');
                window.location.reload();
            });
        },
        error: function (xhr, status, error) {
            console.error('Error adding booking:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Something went wrong while saving.',
                confirmButtonText: 'OK'
            });
        },
        complete: function () {
            $btn.prop('disabled', false).html(originalHtml);
        }
    });
});


// Handle form EDIT submission with loading spinner
$('#editBookingForm').on('submit', function (e) {
    e.preventDefault();

    const $form = $(this);
    const $btn = $form.find('button[type="submit"]');
    const originalHtml = $btn.html();

    // Show spinner and disable button
    $btn.prop('disabled', true).html(`
        <span class="spinner-border spinner-border-sm me-1 text-white" role="status" aria-hidden="true"></span>
        <span class="text-white">Updating...</span>
    `);

    const formData = $form.serialize();

    $.ajax({
        url: '/update_junket_booking',
        method: 'POST',
        data: formData,
        success: function (response) {
            Swal.fire({
                icon: 'success',
                title: 'Updated Successfully',
                text: 'The booking has been updated.',
                confirmButtonText: 'OK'
            }).then((result) => {
                if (result.isConfirmed) {
                    $('#modal-edit-booking').modal('hide');
                    window.location.reload();
                }
            });
        },
        error: function (xhr, status, error) {
            console.error('Error updating booking:', error);
            Swal.fire({
                icon: 'error',
                title: 'Update Failed',
                text: 'Something went wrong while updating.',
                confirmButtonText: 'OK'
            });
        },
        complete: function () {
            // Re-enable and restore button text
            $btn.prop('disabled', false).html(originalHtml);
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



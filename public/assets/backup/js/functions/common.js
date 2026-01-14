$(document).ready(function () {
    // Initialize Flatpickr
    flatpickr("#daterange", {
        mode: "range",
        altInput: true,
        altFormat: "M d, Y",
        dateFormat: "Y-m-d",
        defaultDate: [
            moment().startOf('month').format('YYYY-MM-DD'),
            moment().format('YYYY-MM-DD')
        ],
        showMonths: 2, // Display two months side-by-side
        onReady: function (selectedDates, dateStr, instance) {
            // Automatically navigate the calendar to show previous and current month side by side
            const today = new Date();
            instance.changeMonth(-1, true); // Go to the previous month programmatically
        },
    });

    // Function to parse date range
    window.getDateRange = function () {
        const dateRange = $('#daterange').val();
        if (!dateRange) return null;
        const [start, end] = dateRange.split(' to ');
        return { start, end };
    };
});

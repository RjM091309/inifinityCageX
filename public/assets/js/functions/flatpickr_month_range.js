/**
 * Click a month name in a multi-month flatpickr range calendar to select that full month.
 */
(function (global) {
	function bindFlatpickrMonthNameRangeSelect(instance) {
		if (!instance || !instance.calendarContainer || instance.config.mode !== 'range') {
			return;
		}
		var cc = instance.calendarContainer;
		if (cc.dataset.fpMonthRangeClick === '1') {
			return;
		}
		cc.dataset.fpMonthRangeClick = '1';
		cc.addEventListener('click', function (e) {
			var target = e.target;
			if (!target || !target.classList || !target.classList.contains('cur-month')) {
				return;
			}
			var monthContainers = instance.calendarContainer.querySelectorAll('.flatpickr-month');
			var panelIndex = -1;
			for (var i = 0; i < monthContainers.length; i++) {
				if (monthContainers[i].contains(target)) {
					panelIndex = i;
					break;
				}
			}
			if (panelIndex < 0) {
				return;
			}
			e.preventDefault();
			e.stopPropagation();
			var y = instance.currentYear;
			var m = instance.currentMonth + panelIndex;
			while (m > 11) {
				m -= 12;
				y += 1;
			}
			while (m < 0) {
				m += 12;
				y -= 1;
			}
			var dim = instance.utils.getDaysInMonth(m, y);
			var start = new Date(y, m, 1);
			var end = new Date(y, m, dim);
			if (instance.config.maxDate) {
				var maxD = instance.config.maxDate;
				if (end > maxD) {
					end = new Date(maxD.getFullYear(), maxD.getMonth(), maxD.getDate());
				}
				if (start > maxD) {
					return;
				}
			}
			if (instance.config.minDate) {
				var minD = instance.config.minDate;
				if (start < minD) {
					start = new Date(minD.getFullYear(), minD.getMonth(), minD.getDate());
				}
				if (end < minD) {
					return;
				}
			}
			instance.setDate([start, end], true);
		});
	}

	global.bindFlatpickrMonthNameRangeSelect = bindFlatpickrMonthNameRangeSelect;
})(typeof window !== 'undefined' ? window : this);

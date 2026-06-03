/**
 * Click a month name in a multi-month flatpickr range calendar to select that full month.
 * Auto-applies to all flatpickr instances in range mode.
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
			instance.close();
		});
	}

	function patchFlatpickrConfig(config) {
		config = config || {};
		if (config.mode !== 'range') {
			return config;
		}
		var userOnReady = config.onReady;
		var userOnOpen = config.onOpen;
		return Object.assign({}, config, {
			onReady: function (selectedDates, dateStr, instance) {
				bindFlatpickrMonthNameRangeSelect(instance);
				if (typeof userOnReady === 'function') {
					userOnReady.call(this, selectedDates, dateStr, instance);
				}
			},
			onOpen: function (selectedDates, dateStr, instance) {
				if (typeof userOnOpen === 'function') {
					userOnOpen.call(this, selectedDates, dateStr, instance);
				}
				bindFlatpickrMonthNameRangeSelect(instance);
			}
		});
	}

	function installFlatpickrMonthRangeHook() {
		var fp = global.flatpickr;
		if (!fp || fp.__fpMonthRangeHook) {
			return !!fp;
		}
		var original = fp;
		function wrappedFlatpickr(selector, config) {
			return original(selector, patchFlatpickrConfig(config));
		}
		Object.keys(original).forEach(function (key) {
			wrappedFlatpickr[key] = original[key];
		});
		wrappedFlatpickr.__fpMonthRangeHook = true;
		global.flatpickr = wrappedFlatpickr;
		return true;
	}

	global.bindFlatpickrMonthNameRangeSelect = bindFlatpickrMonthNameRangeSelect;

	installFlatpickrMonthRangeHook();
	if (typeof document !== 'undefined') {
		document.addEventListener('DOMContentLoaded', installFlatpickrMonthRangeHook);
		setTimeout(installFlatpickrMonthRangeHook, 0);
		setTimeout(installFlatpickrMonthRangeHook, 500);
	}
})(typeof window !== 'undefined' ? window : this);

// Initialize color pickers when document is ready
document.addEventListener('DOMContentLoaded', function () {
    // Add iro.js color picker library
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@jaames/iro@5';
    script.onload = initializeColorPickers;
    document.head.appendChild(script);

    // Add click handler for two-tone theme buttons
    document.querySelectorAll('[data-setting="color-mode1"]').forEach(btn => {
        if (!btn.hasAttribute('data-value') || btn.getAttribute('data-value') === 'theme-color-default') return;

        btn.addEventListener('click', function () {
            // Clear color picker selections from localStorage
            localStorage.removeItem('custom-primary-color');
            localStorage.removeItem('custom-secondary-color');

            // Reset color picker button preview to default colors
            const previewCircle = document.getElementById('preview-circle');
            const previewArc = document.getElementById('preview-arc');
            if (previewCircle) previewCircle.setAttribute('fill', '#4361EE');
            if (previewArc) previewArc.setAttribute('fill', '#03045E');

            // Reset the color pickers to default colors
            if (window.primaryPicker) {
                window.primaryPicker.color.hexString = '#4361EE';
            }
            if (window.secondaryPicker) {
                window.secondaryPicker.color.hexString = '#03045E';
            }

            // Hide color picker if it's open
            const pickerContainer = document.getElementById('picker-container');
            if (pickerContainer) {
                pickerContainer.style.display = 'none';
                pickerContainer.classList.remove('show');
            }

            // Remove active class from color picker button
            const colorPickerBtn = document.getElementById('color-picker-btn');
            if (colorPickerBtn) {
                colorPickerBtn.closest('.btn').classList.remove('active');
            }
        });
    });

    // Add click handler for default theme button
    const defaultThemeBtn = document.querySelector('[data-value="theme-color-default"]');
    if (defaultThemeBtn) {
        defaultThemeBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();

            // Clear all stored theme data
            localStorage.clear();

            // Remove all custom styles
            const root = document.documentElement;
            const computedStyle = getComputedStyle(root);
            for (const key of computedStyle) {
                if (key.startsWith('--')) {
                    root.style.removeProperty(key);
                }
            }

            // Remove any custom classes or attributes
            root.removeAttribute('data-bs-theme-color');
            root.setAttribute('data-bs-theme-color', 'theme-color-default');

            // Remove all active classes from buttons
            document.querySelectorAll('[data-setting="color-mode1"]').forEach(btn => {
                btn.classList.remove('active');
            });
            defaultThemeBtn.classList.add('active');

            // Reset color picker button state
            const colorPickerBtn = document.getElementById('color-picker-btn');
            if (colorPickerBtn) {
                const previewCircle = document.getElementById('preview-circle');
                const previewArc = document.getElementById('preview-arc');
                if (previewCircle) previewCircle.setAttribute('fill', '#4361EE');
                if (previewArc) previewArc.setAttribute('fill', '#03045E');
            }

            // Close color picker if open
            const pickerContainer = document.getElementById('picker-container');
            if (pickerContainer) {
                pickerContainer.style.display = 'none';
                pickerContainer.classList.remove('show');
            }

            // Reset the color pickers
            if (window.primaryPicker) {
                window.primaryPicker.color.hexString = '#4361EE';
            }
            if (window.secondaryPicker) {
                window.secondaryPicker.color.hexString = '#03045E';
            }

            // Force page refresh to ensure clean state
            location.reload();
        });
    }
});

function initializeColorPickers() {
    // Wait for a moment to ensure DOM is ready
    setTimeout(() => {
        const primaryPicker = new iro.ColorPicker('#primary-color-picker', {
            width: 250,
            color: '#4361EE',  // Bright blue
            layout: [
                {
                    component: iro.ui.Box,
                    options: {}
                },
                {
                    component: iro.ui.Slider,
                    options: {
                        sliderType: 'hue'
                    }
                }
            ]
        });

        const secondaryPicker = new iro.ColorPicker('#secondary-color-picker', {
            width: 250,
            color: '#03045E',  // Dark navy blue
            layout: [
                {
                    component: iro.ui.Box,
                    options: {}
                },
                {
                    component: iro.ui.Slider,
                    options: {
                        sliderType: 'hue'
                    }
                }
            ]
        });

        // Store pickers globally so they can be accessed by reset function
        window.primaryPicker = primaryPicker;
        window.secondaryPicker = secondaryPicker;

        const pickerBtn = document.getElementById('color-picker-btn');
        const pickerContainer = document.getElementById('picker-container');
        const previewCircle = document.getElementById('preview-circle');
        const previewArc = document.getElementById('preview-arc');
        const applyBtn = document.getElementById('apply-colors');

        // Toggle color picker visibility
        pickerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            pickerContainer.classList.toggle('show');
            pickerContainer.style.display = pickerContainer.style.display === 'none' ? 'block' : 'none';
        });

        // Close picker when clicking outside
        document.addEventListener('click', (e) => {
            if (!pickerContainer.contains(e.target) && e.target !== pickerBtn) {
                pickerContainer.style.display = 'none';
                pickerContainer.classList.remove('show');
            }
        });

        // Prevent closing when clicking inside picker
        pickerContainer.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // Update preview on color change
        primaryPicker.on('color:change', (color) => {
            previewCircle.setAttribute('fill', color.hexString);
            updateThemeColors(color.hexString, secondaryPicker.color.hexString, true);
        });

        secondaryPicker.on('color:change', (color) => {
            previewArc.setAttribute('fill', color.hexString);
            updateThemeColors(primaryPicker.color.hexString, color.hexString, true);
        });

        // Apply colors button click
        applyBtn.addEventListener('click', () => {
            const primaryColor = primaryPicker.color.hexString;
            const secondaryColor = secondaryPicker.color.hexString;

            updateThemeColors(primaryColor, secondaryColor, false);
            pickerContainer.style.display = 'none';
            pickerContainer.classList.remove('show');

            // Save colors to localStorage
            localStorage.setItem('custom-primary-color', primaryColor);
            localStorage.setItem('custom-secondary-color', secondaryColor);

            // Update preview
            previewCircle.setAttribute('fill', primaryColor);
            previewArc.setAttribute('fill', secondaryColor);
        });

        // Load saved colors if they exist
        const savedPrimary = localStorage.getItem('custom-primary-color');
        const savedSecondary = localStorage.getItem('custom-secondary-color');

        if (savedPrimary && savedSecondary) {
            primaryPicker.color.hexString = savedPrimary;
            secondaryPicker.color.hexString = savedSecondary;
            previewCircle.setAttribute('fill', savedPrimary);
            previewArc.setAttribute('fill', savedSecondary);
            updateThemeColors(savedPrimary, savedSecondary, false);
        }

        // Update preview colors to match default theme
        if (previewCircle) previewCircle.setAttribute('fill', '#4361EE');
        if (previewArc) previewArc.setAttribute('fill', '#03045E');

        // Reset function for default theme
        function resetToDefaultColors() {
            if (window.primaryPicker) {
                window.primaryPicker.color.hexString = '#4361EE';
            }
            if (window.secondaryPicker) {
                window.secondaryPicker.color.hexString = '#03045E';
            }
            if (previewCircle) previewCircle.setAttribute('fill', '#4361EE');
            if (previewArc) previewArc.setAttribute('fill', '#03045E');
        }

        // Add click handler for default theme button
        const defaultThemeBtn = document.querySelector('[data-value="theme-color-default"]');
        if (defaultThemeBtn) {
            defaultThemeBtn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();

                // Reset to default colors
                resetToDefaultColors();

                // Clear all stored theme data
                localStorage.clear();

                // Remove all custom styles
                const root = document.documentElement;
                root.removeAttribute('data-bs-theme-color');
                root.setAttribute('data-bs-theme-color', 'theme-color-default');

                // Remove all active classes from buttons
                document.querySelectorAll('[data-setting="color-mode1"]').forEach(btn => {
                    btn.classList.remove('active');
                });
                defaultThemeBtn.classList.add('active');

                // Close color picker if open
                const pickerContainer = document.getElementById('picker-container');
                if (pickerContainer) {
                    pickerContainer.style.display = 'none';
                    pickerContainer.classList.remove('show');
                }

                // Force page refresh to ensure clean state
                location.reload();
            });
        }
    }, 100);
}

// Helper para gumawa ng light variant (blend to white)
function lightenColor(rgb, amount = 0.8) {
    return {
        r: Math.round(rgb.r + (255 - rgb.r) * amount),
        g: Math.round(rgb.g + (255 - rgb.g) * amount),
        b: Math.round(rgb.b + (255 - rgb.b) * amount),
    };
}

function updateThemeColors(primary, secondary, isPreview) {
    const root = document.documentElement;

    // Remove any existing theme color classes
    root.removeAttribute('data-bs-theme-color');

    // Convert primary color to RGB for transparency
    const primaryRgb = hexToRgb(primary);
    const secondaryRgb = hexToRgb(secondary);

    // Compute light variant for inactive crumbs
    const lightRgb = lightenColor(primaryRgb, 0.8);
    const lightHex = `rgb(${lightRgb.r}, ${lightRgb.g}, ${lightRgb.b})`;

    // Expose as CSS vars
    root.style.setProperty('--breadcrumb-bg', lightHex);
    root.style.setProperty('--breadcrumb-active-bg', primary);
    root.style.setProperty('--breadcrumb-text-inactive', primary);
    root.style.setProperty('--breadcrumb-text-active', '#ffffff');


    // Update main theme colors
    root.style.setProperty('--primary-color', primary);
    root.style.setProperty('--secondary-color', secondary);

    // Update Bootstrap theme variables
    root.style.setProperty('--bs-primary', primary);
    root.style.setProperty('--bs-primary-rgb', primaryRgb);
    root.style.setProperty('--bs-secondary', secondary);
    root.style.setProperty('--bs-secondary-rgb', secondaryRgb);

    // Button base styles
    root.style.setProperty('--bs-btn-color', primary);
    root.style.setProperty('--bs-btn-bg', `rgba(${primaryRgb}, 0.1)`);
    root.style.setProperty('--bs-btn-border-color', 'transparent');

    // Details button styles with solid hover
    root.style.setProperty('--bs-btn-hover-color', '#ffffff');
    root.style.setProperty('--bs-btn-hover-bg', primary);
    root.style.setProperty('--bs-btn-hover-border-color', 'transparent');

    // Add custom CSS rule for buttons
    let style = document.getElementById('custom-theme-styles');
    if (!style) {
        style = document.createElement('style');
        style.id = 'custom-theme-styles';
        document.head.appendChild(style);
    }

    // Remove any existing theme-specific styles
    document.querySelectorAll('style[id^="theme-color-"]').forEach(el => el.remove());

    style.textContent = `
         /* Inactive crumbs = 10% opacity ng primary */
  .breadcrumb1.flat a {
    background-color: rgba(var(--bs-primary-rgb), 0.1) !important;
    color: var(--bs-primary) !important;
  }
  .breadcrumb1.flat a::after {
    background-color: rgba(var(--bs-primary-rgb), 0.1) !important;
  }

  /* Hover & active (last) crumb = solid primary */
  .breadcrumb1.flat a:hover,
  .breadcrumb1.flat li.active > a,
  .breadcrumb1.flat li:last-child > a {
    background-color: var(--bs-primary) !important;
    color: #fff              !important;
  }
  .breadcrumb1.flat a:hover::after,
  .breadcrumb1.flat li.active > a::after,
  .breadcrumb1.flat li:last-child > a::after {
    background-color: var(--bs-primary) !important;
  }

  /* Tanggalin arrow pagkatapos ng last crumb */
  .breadcrumb1.flat li:last-child > a::after {
    display: none !important;
  }
        /* Button styles */
        .btn:not(.btn-primary) {
            color: ${primary} !important;
            background-color: rgba(${primaryRgb}, 0.1) !important;
            border-color: transparent !important;
            transition: all 0.2s ease !important;
            box-shadow: 0 1px 2px rgba(${primaryRgb}, 0.05) !important;
        }
        .btn:not(.btn-primary):hover {
            color: #ffffff !important;
            background-color: ${primary} !important;
            box-shadow: 0 2px 4px rgba(${primaryRgb}, 0.2) !important;
        }
        .btn:not(.btn-primary):active,
        .btn:not(.btn-primary):focus {
            color: ${primary} !important;
            background-color: rgba(${primaryRgb}, 0.1) !important;
            border-color: transparent !important;
            box-shadow: none !important;
        }
        .btn-primary {
            background-color: ${primary} !important;
            border-color: ${primary} !important;
            color: #ffffff !important;
        }
        .btn-primary:hover {
            background-color: ${adjustColor(primary, -0.1)} !important;
            border-color: ${adjustColor(primary, -0.1)} !important;
        }
        
        /* Specific styles for Details buttons */
        .btn.details-btn {
            background-color: rgba(${primaryRgb}, 0.1) !important;
            color: ${primary} !important;
        }
        .btn.details-btn:hover {
            background-color: ${primary} !important;
            color: #ffffff !important;
        }

        /* Sidebar menu hover styles */
        .sidebar .sidebar-list .nav-item a:hover,
        .sidebar .sidebar-list .nav-item.active a,
        .sidebar .navbar-nav .nav-item .nav-link:hover,
        .sidebar .navbar-nav .nav-item.active .nav-link {
            background-color: rgba(${primaryRgb}, 0.1) !important;
            color: ${primary} !important;
        }
        
        /* Additional sidebar styles to ensure proper coloring */
        .sidebar .nav-link:hover,
        .sidebar .nav-item:hover > a,
        .sidebar .nav-item.active > a {
            background-color: rgba(${primaryRgb}, 0.1) !important;
            color: ${primary} !important;
        }
    `;

    // Remove active class from other theme buttons if not previewing
    if (!isPreview) {
        document.querySelectorAll('[data-setting="color-mode1"]').forEach(btn => {
            btn.classList.remove('active');
            // Remove any theme-specific attributes
            btn.removeAttribute('data-bs-theme-color');
        });
        const colorPickerBtn = document.getElementById('color-picker-btn');
        if (colorPickerBtn) {
            colorPickerBtn.closest('.btn').classList.add('active');
        }
    }
}

// Helper function to convert hex to rgb
function hexToRgb(hex) {
    // Remove the hash if present
    hex = hex.replace('#', '');

    // Parse the hex values
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    return `${r}, ${g}, ${b}`;
}

// Helper function to adjust color brightness
function adjustColor(hex, factor) {
    // Remove the hash if present
    hex = hex.replace('#', '');

    // Parse the hex values
    let r = parseInt(hex.substring(0, 2), 16);
    let g = parseInt(hex.substring(2, 4), 16);
    let b = parseInt(hex.substring(4, 6), 16);

    // Adjust the brightness
    if (factor > 0) {
        // Lighten
        r = Math.min(255, Math.round(r + (255 - r) * factor));
        g = Math.min(255, Math.round(g + (255 - g) * factor));
        b = Math.min(255, Math.round(b + (255 - b) * factor));
    } else {
        // Darken
        r = Math.max(0, Math.round(r * (1 + factor)));
        g = Math.max(0, Math.round(g * (1 + factor)));
        b = Math.max(0, Math.round(b * (1 + factor)));
    }

    // Convert back to hex
    return `#${(r).toString(16).padStart(2, '0')}${(g).toString(16).padStart(2, '0')}${(b).toString(16).padStart(2, '0')}`;
} 
// Theme handling
export function initTheme() {
  const darkModeToggle = document.getElementById('darkModeToggle');
  
  if (darkModeToggle) {
    darkModeToggle.addEventListener('click', () => {
      document.body.classList.toggle('dark-mode');
      localStorage.setItem('astg-theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
    });
  }

  const pref = localStorage.getItem('astg-theme');
  // Default to dark mode if no preference is saved, or if 'dark' is explicitly saved
  if (pref === 'light') {
    document.body.classList.remove('dark-mode');
  } else {
    document.body.classList.add('dark-mode');
  }
}
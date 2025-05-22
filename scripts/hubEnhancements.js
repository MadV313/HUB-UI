document.addEventListener('DOMContentLoaded', () => {
  const statsUrl = `data/player_stats.json`;
  const userId = new URLSearchParams(window.location.search).get('user');

  if (!userId) return;

  fetch(statsUrl)
    .then(res => res.json())
    .then(data => {
      const stats = data[userId];
      if (!stats) return;

      const arsenal = document.getElementById('arsenalCount');
      const coins = document.getElementById('coinCount');

      if (arsenal) arsenal.textContent = `${stats.cards} / 127`;
      if (coins) coins.textContent = `${stats.coins}`;
    });

  const buttons = document.querySelectorAll('.menu-button');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.add('fade-out');
    });
  });
});

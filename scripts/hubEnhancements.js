document.addEventListener('DOMContentLoaded', () => {
  const statsUrl = `data/player_stats.json`;
  const userId = new URLSearchParams(window.location.search).get('user');

  if (!userId) return;

  fetch(statsUrl)
    .then(res => res.json())
    .then(data => {
      const stats = data[userId];
      if (!stats) return;

      document.getElementById('cardCount')!.textContent = `Cards: ${stats.cards}/127`;
      document.getElementById('coinCount')!.textContent = `Coins: ${stats.coins}`;
    });

  const buttons = document.querySelectorAll('.menu-button');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.add('fade-out');
    });
  });
});

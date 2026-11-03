export default function WordQuestGame() {
  return (
    <iframe
      title="워드 퀘스트 RPG"
      src={`${import.meta.env.BASE_URL}word-quest-game.html`}
      className="h-[85vh] min-h-[640px] max-h-[900px] w-full rounded-[24px] border border-[hsl(var(--border))] bg-white"
    />
  );
}

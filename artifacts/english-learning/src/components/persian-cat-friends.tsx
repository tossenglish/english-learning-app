type PersianCatFriendsProps = {
  variant: 'landing' | 'dashboard' | 'practice';
};

const assetBase = import.meta.env.BASE_URL.replace(/\/$/, '');

const cats = [
  { name: 'cream', file: 'persian-cat-cream.png' },
  { name: 'silver', file: 'persian-cat-silver.png' },
  { name: 'ginger', file: 'persian-cat-ginger.png' },
] as const;

export default function PersianCatFriends({ variant }: PersianCatFriendsProps) {
  return (
    <div className={`persian-cat-stage persian-cat-stage--${variant}`} aria-hidden="true">
      {cats.map((cat) => (
        <img
          key={cat.name}
          src={`${assetBase}/${cat.file}`}
          alt=""
          className={`persian-cat-stage__cat persian-cat-stage__cat--${cat.name}`}
        />
      ))}
    </div>
  );
}

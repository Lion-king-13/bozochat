import { Link } from 'react-router';

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 text-lg font-bold">
      <img src="/favicon.svg" alt="" className="h-7 w-7" />
      BozoChat
    </Link>
  );
}

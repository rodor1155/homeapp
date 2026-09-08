export default function SignOutButton() {
  return (
    <form action="/auth/sign-out" method="post">
      <button type="submit" className="text-action text-sm">
        Sign out
      </button>
    </form>
  );
}

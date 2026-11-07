// Site settings. Edit this file to change the name or add users.
//
// To add a user, run in PyCharm's terminal:
//     python tools/add_user.py <username> "<Full Name>"
// and paste the printed line into USERS below.
//
// NOTE: this is a static site, so login only keeps casual visitors out.
// Anyone who reads the page source can get past it.

const SITE = {
  name: "BPSC Mock Test",
  short: "BPSC",
  tagline: "Previous year papers in real exam mode",
};

const USERS = [
  // username: student   password: bpsc@123   (change this before going live)
  { username: "student", name: "Student", hash: "bebe599ddc5b11ca6bd277210c34c610764f573af3d943f52a8abe466fef37c8" },
];

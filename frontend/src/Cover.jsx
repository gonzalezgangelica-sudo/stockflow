import { useState } from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Link, Paper, TextField, Typography } from "@mui/material";
import { api, saveSession } from "./api.js";
import { BUTTON, NAVY, NAVY_SOFT, PAGE, StoltMark, StoltWordmark } from "./brand.jsx";
import { useLang } from "./i18n.jsx";
import UserMenu from "./UserMenu.jsx";

export default function Cover({ onLogin }) {
  const { t } = useLang();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [reqName, setReqName] = useState("");
  const [reqEmail, setReqEmail] = useState("");
  const [reqNote, setReqNote] = useState("");
  const [reqOk, setReqOk] = useState("");
  const [reqOkKind, setReqOkKind] = useState("success");

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const data = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      saveSession(data.token, data.user);
      onLogin(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendRequest(e) {
    e.preventDefault();
    setReqOk("");
    try {
      await api("/auth/request", {
        method: "POST",
        body: JSON.stringify({ name: reqName, email: reqEmail, note: reqNote }),
      });
      setReqOk(t("requestOk"));
      setReqOkKind("success");
      setReqName("");
      setReqEmail("");
      setReqNote("");
    } catch (err) {
      setReqOk(err.message);
      setReqOkKind("error");
    }
  }

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: { xs: "column", md: "row" } }}>
      <Box
        sx={{
          flex: 1,
          bgcolor: NAVY,
          color: "#fff",
          position: "relative",
          overflow: "hidden",
          px: { xs: 4, md: 8 },
          py: { xs: 5, md: 6 },
          minHeight: { xs: 360, md: "100vh" },
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 2 }}>
          <StoltWordmark />
          <UserMenu compact light />
        </Box>
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", maxWidth: 520, zIndex: 1 }}>
          <Typography
            sx={{
              fontWeight: 800,
              fontSize: { xs: 36, md: 52 },
              lineHeight: 1.08,
              letterSpacing: -0.8,
              mb: 2.5,
            }}
          >
            Stock Flow
          </Typography>
          <Typography sx={{ color: "rgba(255,255,255,0.72)", fontSize: 16, maxWidth: 420, lineHeight: 1.5 }}>
            {t("coverSubtitle")}
          </Typography>
        </Box>
        <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.45)", zIndex: 1 }}>
          {t("coverFooter")}
        </Typography>
        <Box
          sx={{
            position: "absolute",
            width: 420,
            height: 420,
            borderRadius: "50%",
            bgcolor: NAVY_SOFT,
            right: -140,
            bottom: -160,
            opacity: 0.85,
          }}
        />
      </Box>

      <Box
        sx={{
          flex: 1,
          bgcolor: PAGE,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          px: 3,
          py: 6,
          position: "relative",
        }}
      >
        <Box sx={{ position: "absolute", top: 16, right: 16, display: { xs: "none", md: "block" } }}>
          <UserMenu compact />
        </Box>
        <Paper
          elevation={0}
          sx={{
            width: "100%",
            maxWidth: 380,
            p: { xs: 3, md: 4.5 },
            borderRadius: 2,
            boxShadow: "0 16px 40px rgba(15, 40, 90, 0.08)",
          }}
        >
          <Box sx={{ mb: 1.5 }}>
            <StoltMark size={32} />
          </Box>
          <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>
            {t("welcome")}
          </Typography>
          <Typography sx={{ color: "text.secondary", mb: 3, fontSize: 14 }}>
            {t("access")}
          </Typography>
          <Box component="form" onSubmit={submit}>
            <TextField
              fullWidth
              label={t("email")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              margin="dense"
              autoComplete="username"
            />
            <TextField
              fullWidth
              label={t("password")}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              margin="dense"
              autoComplete="current-password"
              sx={{ mb: 2 }}
            />
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            <Button
              type="submit"
              fullWidth
              variant="contained"
              disabled={busy}
              sx={{
                py: 1.15,
                textTransform: "none",
                fontWeight: 700,
                bgcolor: BUTTON,
                "&:hover": { bgcolor: NAVY },
              }}
            >
              {busy ? t("signingIn") : t("signIn")}
            </Button>
          </Box>
          <Typography align="center" sx={{ mt: 2 }}>
            <Link
              href="#"
              underline="hover"
              sx={{ color: BUTTON, fontSize: 13, fontWeight: 600 }}
              onClick={(e) => {
                e.preventDefault();
                setRequestOpen(true);
              }}
            >
              {t("requestAccess")}
            </Link>
          </Typography>
        </Paper>
      </Box>

      <Dialog open={requestOpen} onClose={() => setRequestOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{t("requestTitle")}</DialogTitle>
        <Box component="form" onSubmit={sendRequest}>
          <DialogContent>
            <TextField fullWidth label={t("name")} value={reqName} onChange={(e) => setReqName(e.target.value)} margin="dense" required />
            <TextField fullWidth label={t("email")} type="email" value={reqEmail} onChange={(e) => setReqEmail(e.target.value)} margin="dense" required />
            <TextField fullWidth label={t("comment")} value={reqNote} onChange={(e) => setReqNote(e.target.value)} margin="dense" multiline minRows={2} />
            {reqOk && (
              <Alert severity={reqOkKind} sx={{ mt: 2 }}>
                {reqOk}
              </Alert>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setRequestOpen(false)}>{t("close")}</Button>
            <Button type="submit" variant="contained">
              {t("send")}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Box>
  );
}

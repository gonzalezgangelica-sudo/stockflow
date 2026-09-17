import { useState } from "react";
import { Avatar, Box, Divider, IconButton, ListItemIcon, Menu, MenuItem, Typography } from "@mui/material";
import AccountCircle from "@mui/icons-material/AccountCircle";
import Check from "@mui/icons-material/Check";
import DarkModeOutlined from "@mui/icons-material/DarkModeOutlined";
import ExpandLess from "@mui/icons-material/ExpandLess";
import ExpandMore from "@mui/icons-material/ExpandMore";
import Language from "@mui/icons-material/Language";
import LightModeOutlined from "@mui/icons-material/LightModeOutlined";
import Logout from "@mui/icons-material/Logout";
import { RED } from "./brand.jsx";
import { useLang } from "./i18n.jsx";
import { useThemeMode } from "./theme.jsx";

function Row({ icon, label, selected, onClick }) {
  return (
    <MenuItem onClick={onClick} sx={{ py: 0.7, borderRadius: 1, mx: 0.5 }}>
      <ListItemIcon sx={{ minWidth: 32, color: "text.secondary" }}>{icon}</ListItemIcon>
      <Typography variant="body2" sx={{ flex: 1 }}>
        {label}
      </Typography>
      {selected ? <Check fontSize="small" sx={{ color: "text.secondary" }} /> : null}
    </MenuItem>
  );
}

function AccountPopover({ anchor, onClose, onLogout, compact = false }) {
  const { lang, setLanguage, t } = useLang();
  const { mode, setTheme } = useThemeMode();
  return (
    <Menu
      anchorEl={anchor}
      open={Boolean(anchor)}
      onClose={onClose}
      anchorOrigin={compact ? { vertical: "bottom", horizontal: "right" } : { vertical: "top", horizontal: "left" }}
      transformOrigin={compact ? { vertical: "top", horizontal: "right" } : { vertical: "bottom", horizontal: "left" }}
      slotProps={{
        paper: {
          sx: { width: 248, borderRadius: 2, mb: 1, boxShadow: "0 12px 32px rgba(0,0,0,0.18)" },
        },
      }}
    >
      <Typography sx={{ px: 2, pt: 1.5, pb: 0.5, fontSize: 12, fontWeight: 700, color: "text.secondary" }}>
        {t("account")}
      </Typography>
      <Typography sx={{ px: 2, pt: 0.5, fontSize: 12, color: "text.secondary" }}>{t("language")}</Typography>
      <Row icon={<Language fontSize="small" />} label={t("spanish")} selected={lang === "es"} onClick={() => setLanguage("es")} />
      <Row icon={<Language fontSize="small" />} label={t("english")} selected={lang === "en"} onClick={() => setLanguage("en")} />
      <Typography sx={{ px: 2, pt: 1, fontSize: 12, color: "text.secondary" }}>{t("theme")}</Typography>
      <Row icon={<LightModeOutlined fontSize="small" />} label={t("light")} selected={mode === "light"} onClick={() => setTheme("light")} />
      <Row icon={<DarkModeOutlined fontSize="small" />} label={t("dark")} selected={mode === "dark"} onClick={() => setTheme("dark")} />
      {onLogout && <Divider sx={{ my: 1 }} />}
      {onLogout && (
        <Row
          icon={<Logout fontSize="small" />}
          label={t("logout")}
          onClick={() => {
            onClose();
            onLogout();
          }}
        />
      )}
    </Menu>
  );
}

export default function UserMenu({ user, onLogout, compact = false, light = false }) {
  const [anchor, setAnchor] = useState(null);
  const open = Boolean(anchor);

  if (compact) {
    return (
      <>
        <IconButton onClick={(e) => setAnchor(e.currentTarget)} sx={{ color: light ? "#fff" : "inherit" }} aria-label="account">
          <AccountCircle />
        </IconButton>
        <AccountPopover anchor={anchor} onClose={() => setAnchor(null)} compact />
      </>
    );
  }

  return (
    <Box sx={{ p: 1.5, pt: 0 }}>
      <AccountPopover anchor={anchor} onClose={() => setAnchor(null)} onLogout={onLogout} />
      <Box
        onClick={(e) => setAnchor(open ? null : e.currentTarget)}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.2,
          px: 1,
          py: 1,
          borderRadius: 2,
          cursor: "pointer",
          bgcolor: open ? "rgba(255,255,255,0.12)" : "transparent",
          "&:hover": { bgcolor: "rgba(255,255,255,0.1)" },
        }}
      >
        <Avatar sx={{ width: 36, height: 36, bgcolor: RED, fontSize: 16, fontWeight: 800 }}>S</Avatar>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography noWrap sx={{ fontSize: 13, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>
            {user?.name || "Stock Flow"}
          </Typography>
          <Typography noWrap sx={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>
            {user?.email || ""}
          </Typography>
        </Box>
        {open ? <ExpandLess sx={{ color: "rgba(255,255,255,0.8)" }} /> : <ExpandMore sx={{ color: "rgba(255,255,255,0.8)" }} />}
      </Box>
    </Box>
  );
}

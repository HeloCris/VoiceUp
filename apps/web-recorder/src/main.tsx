import React from 'react';
import ReactDOM from 'react-dom/client';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles.css';
import { AuthProvider } from './state/useAuth';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#6d32a2',
    },
    secondary: {
      main: '#9e6df7',
    },
    background: {
      default: 'transparent',
      paper: '#ffffff',
    },
  },
  typography: {
    fontFamily: '"Space Grotesk", "Helvetica Neue", Arial, sans-serif',
    h4: {
      fontWeight: 700,
      letterSpacing: -0.5,
    },
  },
  shape: {
    borderRadius: 18,
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 22,
          border: '1px solid rgba(109, 50, 162, 0.12)',
          boxShadow: '0 12px 24px rgba(36, 12, 74, 0.12)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 14,
        },
        containedPrimary: {
          boxShadow: '0 12px 20px rgba(109, 50, 162, 0.25)',
        },
        outlined: {
          borderColor: 'rgba(109, 50, 162, 0.3)',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 600,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 20,
        },
      },
    },
  },
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>
);

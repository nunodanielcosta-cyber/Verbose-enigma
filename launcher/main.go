// OtoDita — lançador para Windows.
//
// Serve a aplicação web embutida em http://localhost (necessário para o microfone),
// abre-a numa janela própria (Edge/Chrome em modo aplicação) e faz de ponte para o
// Ollama local em /ollama/ — assim não é preciso configurar OLLAMA_ORIGINS.
// Tudo corre apenas neste computador (escuta só em 127.0.0.1).
package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"mime"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

//go:embed all:web
var webFS embed.FS

var version = "dev"

const basePort = 8765

func main() {
	fmt.Println("==============================================")
	fmt.Println("  OtoDita — ditado clínico ORL  (" + version + ")")
	fmt.Println("==============================================")

	noBrowser := false
	for _, a := range os.Args[1:] {
		if a == "--sem-navegador" || a == "--no-browser" {
			noBrowser = true
		}
	}

	// Se o OtoDita já estiver a correr, abre apenas uma nova janela.
	if isOtoDita(basePort) {
		u := fmt.Sprintf("http://localhost:%d/", basePort)
		fmt.Println("O OtoDita já está a correr — a abrir", u)
		openApp(u)
		time.Sleep(1500 * time.Millisecond)
		return
	}

	ln, port := listen()
	if ln == nil {
		fatal("Não foi possível abrir nenhuma porta local (8765-8775).")
	}
	appURL := fmt.Sprintf("http://localhost:%d/", port)

	_ = mime.AddExtensionType(".webmanifest", "application/manifest+json")
	_ = mime.AddExtensionType(".js", "text/javascript; charset=utf-8")
	_ = mime.AddExtensionType(".svg", "image/svg+xml")

	sub, err := fs.Sub(webFS, "web")
	if err != nil {
		fatal(err.Error())
	}
	mux := http.NewServeMux()
	mux.Handle("/ollama/", ollamaProxy())
	mux.HandleFunc("/launcher.json", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		_ = json.NewEncoder(w).Encode(map[string]any{"app": "OtoDita", "version": version, "ollamaProxy": "/ollama"})
	})
	files := http.FileServer(http.FS(sub))
	mux.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		files.ServeHTTP(w, r)
	}))

	fmt.Println()
	fmt.Println("  Aplicação:  ", appURL)
	fmt.Println("  IA local:    Ollama em http://127.0.0.1:11434 (via ponte /ollama)")
	fmt.Println()
	fmt.Println("  Mantenha esta janela aberta enquanto usa o OtoDita.")
	fmt.Println("  Para terminar, feche esta janela.")
	fmt.Println()

	if !noBrowser {
		go func() {
			time.Sleep(300 * time.Millisecond)
			openApp(appURL)
		}()
	}

	srv := &http.Server{Handler: mux, ReadHeaderTimeout: 10 * time.Second}
	if err := srv.Serve(ln); err != nil {
		fatal(err.Error())
	}
}

func listen() (net.Listener, int) {
	for p := basePort; p <= basePort+10; p++ {
		ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", p))
		if err == nil {
			return ln, p
		}
	}
	return nil, 0
}

func isOtoDita(port int) bool {
	c := http.Client{Timeout: 700 * time.Millisecond}
	res, err := c.Get(fmt.Sprintf("http://127.0.0.1:%d/launcher.json", port))
	if err != nil {
		return false
	}
	defer res.Body.Close()
	var v map[string]any
	return res.StatusCode == 200 && json.NewDecoder(res.Body).Decode(&v) == nil && v["app"] == "OtoDita"
}

// ollamaProxy reencaminha /ollama/* para o Ollama local, sem o cabeçalho Origin
// (o Ollama rejeita origens que não conhece). Respostas em streaming passam de imediato.
func ollamaProxy() http.Handler {
	target := os.Getenv("OLLAMA_HOST")
	if target == "" {
		target = "http://127.0.0.1:11434"
	}
	if !strings.HasPrefix(target, "http") {
		target = "http://" + target
	}
	if strings.HasPrefix(target, "http://0.0.0.0") {
		target = strings.Replace(target, "0.0.0.0", "127.0.0.1", 1)
	}
	u, err := url.Parse(target)
	if err != nil {
		fatal("OLLAMA_HOST inválido: " + target)
	}
	rp := &httputil.ReverseProxy{
		Rewrite: func(pr *httputil.ProxyRequest) {
			pr.SetURL(u)
			pr.Out.URL.Path = strings.TrimPrefix(pr.In.URL.Path, "/ollama")
			pr.Out.URL.RawPath = ""
			pr.Out.Host = u.Host
			pr.Out.Header.Del("Origin")
			pr.Out.Header.Del("Referer")
		},
		FlushInterval: -1,
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			http.Error(w, "Ollama não está a correr neste computador ("+u.Host+").", http.StatusBadGateway)
		},
	}
	return rp
}

// openApp abre a aplicação numa janela própria (Edge ou Chrome em modo --app);
// se não encontrar nenhum, usa o navegador predefinido.
func openApp(u string) {
	if runtime.GOOS != "windows" {
		for _, c := range []string{"xdg-open", "open"} {
			if exec.Command(c, u).Start() == nil {
				return
			}
		}
		return
	}
	var candidates []string
	for _, env := range []string{"ProgramFiles(x86)", "ProgramFiles", "LocalAppData"} {
		base := os.Getenv(env)
		if base == "" {
			continue
		}
		candidates = append(candidates,
			filepath.Join(base, "Microsoft", "Edge", "Application", "msedge.exe"),
			filepath.Join(base, "Google", "Chrome", "Application", "chrome.exe"),
		)
	}
	for _, exe := range candidates {
		if _, err := os.Stat(exe); err == nil {
			if exec.Command(exe, "--app="+u, "--window-size=1400,950").Start() == nil {
				return
			}
		}
	}
	_ = exec.Command("rundll32", "url.dll,FileProtocolHandler", u).Start()
}

func fatal(msg string) {
	fmt.Println()
	fmt.Println("ERRO:", msg)
	fmt.Println("Prima Enter para fechar.")
	_, _ = fmt.Scanln()
	os.Exit(1)
}

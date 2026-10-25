import SwiftUI

@main
struct TorrentSearchApp: App {
    @StateObject private var app = AppState.shared

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(app)
                .preferredColorScheme(app.darkTheme.scheme)
                .toastOverlay()
        }
    }
}

struct RootView: View {
    @EnvironmentObject var app: AppState
    @State private var checkedProviders = false

    var body: some View {
        TabView {
            HomeView().tabItem { Label(L("Buscar"), systemImage: "magnifyingglass") }
            BrowseView().tabItem { Label(L("Explorar"), systemImage: "sparkles") }
            BookmarksView().tabItem { Label(L("Favoritos"), systemImage: "bookmark") }
            SettingsView().tabItem { Label(L("Ajustes"), systemImage: "gearshape") }
        }
        // Primeira execução: pergunta se quer ativar os buscadores recomendados (como no original).
        .alert(L("Ativar buscadores"), isPresented: Binding(get: { app.enabledProviderIds == nil }, set: { _ in })) {
            Button(L("Ativar recomendados")) { app.enableDefaultProviders() }
            Button(L("Vou escolher"), role: .cancel) { app.skipDefaultProviders() }
        } message: {
            Text(L("Nenhum buscador está ativo ainda. Quer ativar os recomendados?"))
        }
        .task {
            guard !checkedProviders, app.checkProvidersOnStartup, app.enabledProviderIds != nil else { return }
            checkedProviders = true
            if let r = await app.updateProtectionStatus(), r.locked > 0 {
                Toast.shared.show(L("%ld buscadores precisam de desbloqueio", r.locked))
            }
        }
    }
}

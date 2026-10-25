import XCTest
@testable import TorrentSearchCore

final class ProviderTests: XCTestCase {
    /// Verificações estáticas: ids únicos e categorias declaradas.
    func testRegistryIsConsistent() {
        let ids = ProviderRegistry.builtin.map(\.id)
        XCTAssertEqual(ids.count, Set(ids).count, "IDs duplicados")
        for p in ProviderRegistry.builtin {
            XCTAssertFalse(p.supportedCategories.isEmpty, "\(p.name) sem categorias")
            XCTAssertTrue(p.url.hasPrefix("https://"), "\(p.name) sem HTTPS")
        }
    }

    func testUtils() throws {
        XCTAssertEqual(try TorrentUtils.getInfoHashFromMagnetUri("magnet:?xt=urn:btih:ABCDEF&dn=x"), "abcdef")
        XCTAssertEqual(FileSizeUtils.getBytes("1 KB"), 1024)
        XCTAssertEqual(FileSizeUtils.getBytes("2GiB"), 2 * 1024 * 1024 * 1024)
        XCTAssertEqual(FileSizeUtils.normalizeSize("1.2GB"), "1.2 GB")
        XCTAssertEqual("hello world".uriEncoded, "hello%20world")
        XCTAssertNotNil(TorrentDateParser.parse("12/3/2024", format: "d/M/yyyy"))
        XCTAssertNotNil(TorrentDateParser.tryParseRelative("3 days ago"))
        XCTAssertTrue(TorrentUtils.createTorrentId(providerId: "x", sourceId: "y").hasPrefix("x:"))
    }

    /// Teste ao vivo contra os sites reais (só roda com LIVE=1 no CI).
    /// Grava um relatório JSON com o resultado de cada buscador.
    func testLiveSearch() async throws {
        guard ProcessInfo.processInfo.environment["LIVE"] == "1" else { throw XCTSkip("LIVE != 1") }
        var report: [[String: Any]] = []
        await withTaskGroup(of: [String: Any].self) { group in
            for p in ProviderRegistry.builtin {
                group.addTask { await Self.probe(p) }
            }
            for await r in group { report.append(r) }
        }
        report.sort { ($0["id"] as? String ?? "") < ($1["id"] as? String ?? "") }
        let data = try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys])
        let out = ProcessInfo.processInfo.environment["REPORT_PATH"] ?? "provider-report.json"
        try data.write(to: URL(fileURLWithPath: out))
        for r in report {
            print("PROVIDER \(r["id"] ?? "") results=\(r["results"] ?? "") error=\(r["error"] ?? "-") magnet=\(r["magnet"] ?? "-")")
        }
    }

    static func query(for p: SearchProvider) -> String {
        let c = p.supportedCategories
        if p.id == "linuxtracker" { return "ubuntu" }
        if c == [.anime] { return "one piece" }
        if c == [.books] { return "harry potter" }
        if c == [.games] { return "minecraft" }
        if c == [.porn] { return "amateur" }
        if c == [.series] { return "the office" }
        if c == [.apps] { return "ubuntu" }
        return "ubuntu"
    }

    static func probe(_ p: SearchProvider) async -> [String: Any] {
        var r: [String: Any] = ["id": p.id, "name": p.name, "cloudflare": p.isCloudflareProtected]
        let start = Date()
        do {
            let list = try await p.search(query: query(for: p).uriEncoded, category: .all)
            r["results"] = list.count
            if let t = list.first {
                r["sample"] = [
                    "name": t.name, "size": t.size ?? "", "seeders": t.seeders ?? -1, "peers": t.peers ?? -1,
                    "date": t.uploadDate.map { ISO8601DateFormatter().string(from: $0) } ?? "",
                    "category": t.category?.rawValue ?? "", "details": t.detailsPageUrl ?? "",
                ]
                switch t.magnetUri {
                case .available(let m): r["magnet"] = m.hasPrefix("magnet:") ? "ok" : "invalid"
                case .requiresFetch(let u):
                    if let mp = p as? MagnetUriProvider {
                        do {
                            let m = try await mp.getMagnetUri(url: u)
                            r["magnet"] = m.hasPrefix("magnet:") ? "fetched-ok" : "fetched-invalid:\(m.prefix(60))"
                        } catch { r["magnet"] = "fetch-error: \(error)" }
                    } else { r["magnet"] = "requires-fetch-without-provider" }
                }
            }
            if let lp = p as? LatestTorrentsProvider {
                r["latest"] = (try? await lp.getLatestTorrents(category: .all).count) ?? -1
            }
            if let tp = p as? TopTorrentsProvider {
                r["top"] = (try? await tp.getTopTorrents(category: .all).count) ?? -1
            }
        } catch {
            r["results"] = -1
            r["error"] = String(describing: error).prefix(300).description
        }
        r["seconds"] = Int(Date().timeIntervalSince(start))
        return r
    }
}

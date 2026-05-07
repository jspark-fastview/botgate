package io.guardus.admin.controller;

import io.guardus.admin.service.SessionService;
import io.guardus.admin.util.NanoId;
import io.guardus.admin.util.PasswordUtil;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;

/**
 * /auth/register  /auth/login  /auth/logout  /auth/me
 */
@RestController
public class AuthController {

    private final JdbcTemplate    db;
    private final SessionService  sessions;

    public AuthController(JdbcTemplate db, SessionService sessions) {
        this.db       = db;
        this.sessions = sessions;
    }

    /** POST /auth/register */
    @PostMapping("/auth/register")
    public ResponseEntity<Map<String, Object>> register(@RequestBody Map<String, Object> body) {
        String email    = (String) body.get("email");
        String password = (String) body.get("password");
        String name     = (String) body.get("name");

        if (email == null || password == null || name == null
                || email.isBlank() || password.length() < 8 || name.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "email, password(8자+), name 필수"));
        }

        String id   = "u_" + NanoId.generate(10);
        String hash = PasswordUtil.hash(password);
        try {
            db.update("INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)",
                    id, email, hash, name);
        } catch (Exception e) {
            if (e.getMessage() != null && e.getMessage().contains("UNIQUE")) {
                return ResponseEntity.status(409).body(Map.of("error", "이미 사용 중인 이메일이에요."));
            }
            throw e;
        }
        return ResponseEntity.status(201).body(Map.of("id", id, "email", email, "name", name));
    }

    /** POST /auth/login */
    @PostMapping("/auth/login")
    public ResponseEntity<Map<String, Object>> login(@RequestBody Map<String, Object> body) {
        String email    = (String) body.get("email");
        String password = (String) body.get("password");
        if (email == null || password == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "email, password 필수"));
        }

        List<Map<String, Object>> rows = db.queryForList(
                "SELECT * FROM users WHERE email = ? AND active = 1", email);
        if (rows.isEmpty()) {
            return ResponseEntity.status(401).body(Map.of("error", "이메일 또는 비밀번호가 잘못됐어요."));
        }
        Map<String, Object> user = rows.get(0);
        String storedHash = (String) user.get("password_hash");

        if (!PasswordUtil.verify(password, storedHash)) {
            return ResponseEntity.status(401).body(Map.of("error", "이메일 또는 비밀번호가 잘못됐어요."));
        }

        // 만료 세션 정리
        db.update("DELETE FROM sessions WHERE user_id = ? AND expires_at < datetime('now')", user.get("id"));

        // 새 세션 생성
        String token     = NanoId.generate(48);
        String expiresAt = Instant.now().plus(30, ChronoUnit.DAYS)
                .toString().replace("T", " ").substring(0, 19);
        db.update("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
                token, user.get("id"), expiresAt);

        var resp = new java.util.LinkedHashMap<String, Object>();
        resp.put("token", token);
        resp.put("id",    user.get("id"));
        resp.put("email", user.get("email"));
        resp.put("name",  user.get("name"));
        return ResponseEntity.ok(resp);
    }

    /** POST /auth/logout */
    @PostMapping("/auth/logout")
    public Map<String, Object> logout(@RequestHeader(value = "Authorization", required = false) String auth) {
        if (auth != null && !auth.isBlank()) {
            String token = auth.replaceAll("(?i)^Bearer\\s+", "");
            if (!token.isBlank()) db.update("DELETE FROM sessions WHERE token = ?", token);
        }
        return Map.of("ok", true);
    }

    /** GET /auth/me  (세션 필요) */
    @GetMapping("/auth/me")
    public ResponseEntity<Map<String, Object>> me(
            @RequestHeader(value = "Authorization", required = false) String auth) {
        Map<String, Object> user = sessions.validate(auth);
        if (user == null) return ResponseEntity.status(401).body(Map.of("error", "not authenticated"));
        var u = new java.util.LinkedHashMap<String, Object>();
        u.put("id", user.get("id")); u.put("email", user.get("email")); u.put("name", user.get("name"));
        return ResponseEntity.ok(u);
    }
}

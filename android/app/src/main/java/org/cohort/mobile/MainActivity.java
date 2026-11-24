package org.cohort.mobile;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.net.URLEncoder;

/**
 * Cohort 手机端（教师端 / 学生端共用一套代码，靠 flavor 的 IS_STUDENT 区分）。
 *
 * 这里是「客户端」：真正的服务（PHP + Caddy + AI）还是跑在老师那台 Windows 上，
 * 手机只负责把页面装进一个没有地址栏、没有标签页的窗口里，连同一个 Wi-Fi 就能用。
 *
 * 学生端：填 服务器地址 + 学号 + 姓名 → 打开 /?no=&name=
 * 教师端：填 服务器地址 → 打开 /teacher（控制台）
 */
public class MainActivity extends Activity {

    private static final int PAPER = 0xFFFCFBF6;
    private static final int INK = 0xFF16150F;
    private static final int INK_SOFT = 0xFF4B4A41;
    private static final int LINE = 0xFFD9D5C6;
    private static final int RED = 0xFFAD1F26;

    private SharedPreferences sp;
    private LinearLayout form;
    private FrameLayout root;
    private EditText etServer, etNo, etName;
    private TextView tvState;
    private WebView web;
    private String defaultUrl;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        sp = getSharedPreferences("cohort", MODE_PRIVATE);
        defaultUrl = sp.getString("server", "http://192.168.10.107:8080");
        buildForm();
    }

    // ---------------------------------------------------------------- 表单

    private int dp(float v) {
        return (int) (v * getResources().getDisplayMetrics().density + 0.5f);
    }

    private TextView label(String text) {
        TextView t = new TextView(this);
        t.setText(text);
        t.setTextSize(11.5f);
        t.setTextColor(INK_SOFT);
        t.setPadding(0, dp(10), 0, dp(3));
        return t;
    }

    private EditText box(String hint, String value, int type) {
        EditText e = new EditText(this);
        e.setHint(hint);
        e.setText(value);
        e.setTextSize(14f);
        e.setTextColor(INK);
        e.setHintTextColor(0xFF9A9788);
        e.setInputType(type);
        e.setSingleLine(true);
        e.setBackgroundColor(0xFFFFFFFF);
        e.setPadding(dp(10), dp(7), dp(10), dp(7));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.bottomMargin = dp(2);
        e.setLayoutParams(lp);
        return e;
    }

    private void buildForm() {
        form = new LinearLayout(this);
        form.setOrientation(LinearLayout.VERTICAL);
        form.setBackgroundColor(PAPER);
        form.setPadding(dp(20), dp(24), dp(20), dp(20));

        TextView title = new TextView(this);
        title.setText(BuildConfig.IS_STUDENT ? "进入课堂" : "讲台控制台");
        title.setTextSize(21f);
        title.setTextColor(INK);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        form.addView(title);

        TextView sub = new TextView(this);
        sub.setText(BuildConfig.IS_STUDENT
                ? "填老师给的地址，加你的学号和姓名；连的是同一个 Wi-Fi。"
                : "手机上看控制台：开课、看学生、看报表，改配置还是用电脑。");
        sub.setTextSize(11.5f);
        sub.setTextColor(INK_SOFT);
        sub.setPadding(0, dp(4), 0, dp(14));
        form.addView(sub);

        form.addView(label("服务器地址"));
        etServer = box("http://192.168.10.107:8080", defaultUrl, InputType.TYPE_TEXT_VARIATION_URI);
        form.addView(etServer);

        if (BuildConfig.IS_STUDENT) {
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);

            LinearLayout left = new LinearLayout(this);
            left.setOrientation(LinearLayout.VERTICAL);
            left.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
            left.addView(label("学号"));
            etNo = box("例如 20260701", sp.getString("no", ""), InputType.TYPE_CLASS_NUMBER);
            left.addView(etNo);

            LinearLayout right = new LinearLayout(this);
            right.setOrientation(LinearLayout.VERTICAL);
            LinearLayout.LayoutParams rlp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.6f);
            rlp.leftMargin = dp(10);
            right.setLayoutParams(rlp);
            right.addView(label("姓名"));
            etName = box("例如 陈福尧", sp.getString("name", ""), InputType.TYPE_CLASS_TEXT);
            right.addView(etName);

            row.addView(left);
            row.addView(right);
            form.addView(row);
        }

        Button go = new Button(this);
        go.setText(BuildConfig.IS_STUDENT ? "进入课堂" : "打开控制台");
        go.setTextSize(15f);
        go.setTextColor(0xFFFFFFFF);
        go.setBackgroundColor(INK);
        go.setAllCaps(false);
        LinearLayout.LayoutParams glp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(46));
        glp.topMargin = dp(18);
        go.setLayoutParams(glp);
        go.setOnClickListener(new View.OnClickListener() {
            public void onClick(View v) {
                open();
            }
        });
        form.addView(go);

        tvState = new TextView(this);
        tvState.setTextSize(11.5f);
        tvState.setTextColor(INK_SOFT);
        tvState.setPadding(0, dp(12), 0, 0);
        tvState.setText("还没连接");
        form.addView(tvState);

        ScrollView sv = new ScrollView(this);
        sv.setBackgroundColor(PAPER);
        sv.setFillViewport(true);
        sv.addView(form);

        root = new FrameLayout(this);
        root.setBackgroundColor(PAPER);
        root.addView(sv, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
    }

    // ---------------------------------------------------------------- 打开

    private String baseUrl() {
        String s = etServer.getText().toString().trim();
        if (s.isEmpty()) s = "http://192.168.10.107:8080";
        if (!s.startsWith("http://") && !s.startsWith("https://")) s = "http://" + s;
        if (!s.matches("^https?://[^/]+:\\d+.*$") && !s.endsWith(":443") && !s.contains("://127.0.0.1")) {
            s = s + ":8080";
        }
        while (s.endsWith("/")) s = s.substring(0, s.length() - 1);
        return s;
    }

    private void open() {
        String base = baseUrl();
        String url;
        SharedPreferences.Editor ed = sp.edit().putString("server", base);
        if (BuildConfig.IS_STUDENT) {
            String no = etNo.getText().toString().trim();
            String name = etName.getText().toString().trim();
            if (no.isEmpty() || name.isEmpty()) {
                tvState.setTextColor(RED);
                tvState.setText("学号和姓名都要填");
                return;
            }
            ed.putString("no", no).putString("name", name);
            try {
                url = base + "/?no=" + URLEncoder.encode(no, "UTF-8")
                        + "&name=" + URLEncoder.encode(name, "UTF-8");
            } catch (Exception e) {
                url = base + "/?no=" + no + "&name=" + name;
            }
        } else {
            url = base + "/teacher";
        }
        ed.apply();
        showWeb(url);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void showWeb(String url) {
        if (web == null) {
            web = new WebView(this);
            web.setBackgroundColor(PAPER);
            WebSettings ws = web.getSettings();
            ws.setJavaScriptEnabled(true);
            ws.setDomStorageEnabled(true);
            ws.setLoadWithOverviewMode(true);
            ws.setUseWideViewPort(true);
            ws.setBuiltInZoomControls(false);
            ws.setDisplayZoomControls(false);
            ws.setCacheMode(WebSettings.LOAD_DEFAULT);
            if (Build.VERSION.SDK_INT >= 21) {
                ws.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            }
            // 让服务端能认出这是手机端壳子
            ws.setUserAgentString(ws.getUserAgentString() + " CohortAndroid/1.0");
            web.setWebViewClient(new WebViewClient());
            web.setWebChromeClient(new WebChromeClient());
            web.setOnLongClickListener(new View.OnLongClickListener() {
                public boolean onLongClick(View v) {
                    return false;
                }
            });
        }
        // 第一次点：换成 WebView 全屏；之后回到表单再进来还是同一个实例（保留登录态）
        if (web.getParent() == null) {
            root.addView(web, new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        }
        form.setVisibility(View.GONE);
        web.setVisibility(View.VISIBLE);
        web.loadUrl(url);
        tvState.setTextColor(INK_SOFT);
        tvState.setText("已连接：" + url);
    }

    private void backToForm() {
        if (web != null) {
            web.setVisibility(View.GONE);
            web.loadUrl("about:blank");
        }
        form.setVisibility(View.VISIBLE);
        tvState.setTextColor(INK_SOFT);
        tvState.setText("已断开，可以改地址或换人");
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.getVisibility() == View.VISIBLE) {
            if (web.canGoBack()) {
                web.goBack();
            } else {
                backToForm();
            }
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}

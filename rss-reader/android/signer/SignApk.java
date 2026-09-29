import com.android.apksig.ApkSigner;
import com.android.apksig.ApkVerifier;
import java.io.File;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.List;

/**
 * Signs an unsigned APK with the release key (APK Signature Scheme v1 + v2) and verifies it.
 * Used by ../sign.sh; needs Google's apksig library on the classpath.
 *
 * <p>Usage: java -cp apksig.jar SignApk.java in.apk out.apk keystore password
 */
public class SignApk {
  public static void main(String[] args) throws Exception {
    File in = new File(args[0]);
    File out = new File(args[1]);
    char[] password = args[3].toCharArray();

    KeyStore store = KeyStore.getInstance(new File(args[2]), password);
    String alias = "reader";
    PrivateKey key = (PrivateKey) store.getKey(alias, password);
    List<X509Certificate> chain = new ArrayList<>();
    for (Certificate cert : store.getCertificateChain(alias)) chain.add((X509Certificate) cert);

    ApkSigner.SignerConfig signer = new ApkSigner.SignerConfig.Builder("reader", key, chain).build();
    new ApkSigner.Builder(List.of(signer))
        .setInputApk(in)
        .setOutputApk(out)
        .setMinSdkVersion(26)
        .setV1SigningEnabled(true)
        .setV2SigningEnabled(true)
        .setCreatedBy("Reader sign.sh")
        .build()
        .sign();

    ApkVerifier.Result result = new ApkVerifier.Builder(out).setMinCheckedPlatformVersion(26).build().verify();
    if (!result.isVerified()) {
      result.getErrors().forEach(e -> System.err.println("ERROR " + e));
      throw new IllegalStateException("Signed APK doesn't verify");
    }
    byte[] digest = MessageDigest.getInstance("SHA-256").digest(result.getSignerCertificates().get(0).getEncoded());
    StringBuilder hex = new StringBuilder();
    for (byte b : digest) hex.append(hex.length() > 0 ? ":" : "").append(String.format("%02X", b));
    System.out.println("verified v1=" + result.isVerifiedUsingV1Scheme() + " v2=" + result.isVerifiedUsingV2Scheme());
    System.out.println("sha256 " + hex);
  }
}

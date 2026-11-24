
const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 60
  },
  phone: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 16
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: 150
  },
  passwordHash: {
    type: String,
    required: true,
    select: false
  }
}, { timestamps: true });

const User = mongoose.models.User ||
  mongoose.model("User", UserSchema);

function normalizeBdPhone(value) {
  let digits = String(value || "").replace(/[\s()-]/g, "");

  if (digits.startsWith("+880")) {
    digits = digits.slice(1);
  }

  if (digits.startsWith("8801") && digits.length === 13) {
    digits = "0" + digits.slice(3);
  }

  if (!/^01[3-9]\d{8}$/.test(digits)) {
    return null;
  }

  return "+88" + digits;
}

// REGISTER
app.post("/api/auth/register", authLimiter, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const phone = normalizeBdPhone(req.body.phone);
    const password = String(req.body.password || "");

    if (name.length < 2 || name.length > 60) {
      return res.status(400).json({
        success: false,
        message: "সঠিক নাম লিখুন।"
      });
    }

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "সঠিক বাংলাদেশি মোবাইল নম্বর দিন।"
      });
    }

    if (password.length < 10 || password.length > 72) {
      return res.status(400).json({
        success: false,
        message: "পাসওয়ার্ড ১০ থেকে ৭২ অক্ষরের মধ্যে দিন।"
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Email ব্যবহারকারীর কাছ থেকে নেওয়া হচ্ছে না।
    const internalEmail =
      phone.replace(/\D/g, "") + "@phone.rs-pay.invalid";

    const user = await User.create({
      name,
      phone,
      email: internalEmail,
      passwordHash
    });

    req.session.regenerate(err => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: "সেশন তৈরি করা যায়নি।"
        });
      }

      req.session.userId = user._id.toString();

      res.status(201).json({
        success: true,
        user: {
          name: user.name,
          phone: user.phone
        }
      });
    });

  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "এই মোবাইল নম্বর দিয়ে অ্যাকাউন্ট আগে থেকেই আছে।"
      });
    }

    console.error("Registration error:", error.message);

    res.status(500).json({
      success: false,
      message: "অ্যাকাউন্ট তৈরি করা যায়নি।"
    });
  }
});

// LOGIN
app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    const phone = normalizeBdPhone(req.body.phone);
    const password = String(req.body.password || "");

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "সঠিক মোবাইল নম্বর দিন।"
      });
    }

    const user = await User.findOne({ phone })
      .select("+passwordHash");

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({
        success: false,
        message: "মোবাইল নম্বর অথবা পাসওয়ার্ড সঠিক নয়।"
      });
    }

    req.session.regenerate(err => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: "লগইন করা যায়নি।"
        });
      }

      req.session.userId = user._id.toString();

      res.json({
        success: true,
        user: {
          name: user.name,
          phone: user.phone
        }
      });
    });

  } catch (error) {
    console.error("Login error:", error.message);

    res.status(500).json({
      success: false,
      message: "লগইন করা যায়নি।"
    });
  }
});

// CURRENT USER
app.get("/api/auth/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.session.userId)
    .select("name phone");

  if (!user) {
    return req.session.destroy(() =>
      res.status(401).json({ success: false })
    );
  }

  res.json({
    success: true,
    user: {
      name: user.name,
      phone: user.phone || ""
    }
  });
});

// LOGOUT
app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("rs_pay_session", {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax"
    });

    res.json({ success: true });
  });
});

// UPDATE PROFILE
app.put("/api/account/profile", requireAuth, async (req, res) => {
  const name = String(req.body.name || "").trim();

  if (name.length < 2 || name.length > 60) {
    return res.status(400).json({
      success: false,
      message: "সঠিক নাম লিখুন।"
    });
  }

  const user = await User.findByIdAndUpdate(
    req.session.userId,
    { $set: { name } },
    { new: true, runValidators: true }
  ).select("name phone");

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "অ্যাকাউন্ট পাওয়া যায়নি।"
    });
  }

  res.json({
    success: true,
    user: {
      name: user.name,
      phone: user.phone
    }
  });
});

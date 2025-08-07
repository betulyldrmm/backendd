// WheelService.js içine eklenecek yeni metodlar

class WheelService {
  
  // Mevcut metodlarınız...
  
  /**
   * Kullanıcının çark çevirip çeviremeyeceğini kontrol eder (haftada 1 kez)
   */
  async canUserSpin(userId) {
    try {
      const query = `
        SELECT 
          last_spin_date,
          CASE 
            WHEN last_spin_date IS NULL THEN true
            WHEN last_spin_date < DATE_SUB(NOW(), INTERVAL 7 DAY) THEN true
            ELSE false
          END as can_spin,
          DATE_ADD(last_spin_date, INTERVAL 7 DAY) as next_spin_date
        FROM user_wheel_status 
        WHERE user_id = ?
      `;
      
      const [rows] = await this.db.execute(query, [userId]);
      
      if (rows.length === 0) {
        // İlk kez çark çevirecek
        return {
          allowed: true,
          lastSpinDate: null,
          nextSpinDate: null
        };
      }
      
      const row = rows[0];
      return {
        allowed: row.can_spin === 1,
        lastSpinDate: row.last_spin_date,
        nextSpinDate: row.next_spin_date
      };
      
    } catch (error) {
      console.error('Error checking weekly spin limit:', error);
      throw new Error('Çark durumu kontrol edilemedi');
    }
  }

  /**
   * Çark çevirme işlemi - Haftada 1 kez kontrolü ile
   */
  async spinWheel(userId, userIP, userAgent) {
    const connection = await this.db.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Haftada 1 kez kontrolü
      const canSpin = await this.canUserSpin(userId);
      if (!canSpin.allowed) {
        throw new Error('Haftada sadece bir kez çark çevirebilirsiniz');
      }
      
      // Ödül seçimi - Yüksek indirimli ödüller
      const prizes = [
        { id: 1, text: '50 TL İndirim', type: 'money', value: 50, chance: 25 },
        { id: 2, text: '100 TL İndirim', type: 'money', value: 100, chance: 20 },
        { id: 3, text: '75 TL İndirim', type: 'money', value: 75, chance: 20 },
        { id: 4, text: '25 TL İndirim', type: 'money', value: 25, chance: 15 },
        { id: 5, text: '200 TL İndirim', type: 'money', value: 200, chance: 10 },
        { id: 6, text: 'Tekrar Çevir', type: 'try_again', value: 0, chance: 10 }
      ];
      
      // Olasılık bazlı ödül seçimi
      const random = Math.random() * 100;
      let cumulativeChance = 0;
      let selectedPrize = null;
      
      for (const prize of prizes) {
        cumulativeChance += prize.chance;
        if (random <= cumulativeChance) {
          selectedPrize = prize;
          break;
        }
      }
      
      if (!selectedPrize) {
        selectedPrize = prizes[prizes.length - 1]; // Fallback
      }
      
      // Spin kaydını oluştur
      const spinQuery = `
        INSERT INTO wheel_spins (
          user_id, 
          prize_id, 
          prize_type, 
          prize_value, 
          prize_text,
          user_ip, 
          user_agent, 
          spin_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
      `;
      
      const [spinResult] = await connection.execute(spinQuery, [
        userId,
        selectedPrize.id,
        selectedPrize.type,
        selectedPrize.value,
        selectedPrize.text,
        userIP,
        userAgent
      ]);
      
      const spinId = spinResult.insertId;
      
      // "Tekrar çevir" dışındaki ödüller için kupon oluştur
      if (selectedPrize.type !== 'try_again') {
        const couponQuery = `
          INSERT INTO user_prizes (
            user_id, 
            spin_id, 
            prize_type, 
            prize_value, 
            title, 
            description,
            expires_at,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY), NOW())
        `;
        
        await connection.execute(couponQuery, [
          userId,
          spinId,
          selectedPrize.type,
          selectedPrize.value,
          selectedPrize.text,
          `${selectedPrize.value} TL indirim kuponu - Çark'tan kazanıldı`
        ]);
      }
      
      // Son çevirme tarihini güncelle (sadece "tekrar çevir" değilse)
      if (selectedPrize.type !== 'try_again') {
        const updateStatusQuery = `
          INSERT INTO user_wheel_status (user_id, last_spin_date, total_spins, streak)
          VALUES (?, NOW(), 1, 1)
          ON DUPLICATE KEY UPDATE 
            last_spin_date = NOW(),
            total_spins = total_spins + 1,
            streak = CASE 
              WHEN DATEDIFF(NOW(), last_spin_date) <= 14 THEN streak + 1
              ELSE 1
            END
        `;
        
        await connection.execute(updateStatusQuery, [userId]);
      }
      
      await connection.commit();
      
      return {
        spinId,
        prize: selectedPrize,
        message: selectedPrize.type === 'try_again' ? 
          'Tekrar çevirme hakkı kazandın!' : 
          `Tebrikler! ${selectedPrize.text} kazandın!`,
        canPlayDoubleGame: selectedPrize.type !== 'try_again'
      };
      
    } catch (error) {
      await connection.rollback();
      console.error('Spin wheel error:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Çift-tek oyunu
   */
  async playDoubleGame(userId, spinId, choice) {
    const connection = await this.db.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Spin'in var olduğunu ve kullanıcıya ait olduğunu kontrol et
      const spinQuery = `
        SELECT * FROM wheel_spins 
        WHERE id = ? AND user_id = ? AND prize_type != 'try_again'
      `;
      
      const [spinRows] = await connection.execute(spinQuery, [spinId, userId]);
      
      if (spinRows.length === 0) {
        throw new Error('Geçersiz spin ID veya çift-tek oyunu oynanamaz');
      }
      
      const spin = spinRows[0];
      
      // Zaten çift-tek oyunu oynandı mı kontrol et
      const doubleGameQuery = `
        SELECT * FROM double_games WHERE spin_id = ?
      `;
      
      const [doubleGameRows] = await connection.execute(doubleGameQuery, [spinId]);
      
      if (doubleGameRows.length > 0) {
        throw new Error('Bu spin için çift-tek oyunu zaten oynandı');
      }
      
      // Rastgele sayı üret (1-10)
      const randomNumber = Math.floor(Math.random() * 10) + 1;
      const isEven = randomNumber % 2 === 0;
      const userWon = (choice === 'even' && isEven) || (choice === 'odd' && !isEven);
      
      // Çift-tek oyunu kaydını oluştur
      const insertDoubleGameQuery = `
        INSERT INTO double_games (
          spin_id, 
          user_id, 
          user_choice, 
          random_number, 
          won, 
          created_at
        ) VALUES (?, ?, ?, ?, ?, NOW())
      `;
      
      await connection.execute(insertDoubleGameQuery, [
        spinId, userId, choice, randomNumber, userWon
      ]);
      
      let finalPrizeValue = spin.prize_value;
      
      if (userWon) {
        // Ödülü ikiye katla
        finalPrizeValue = spin.prize_value * 2;
        
        // Mevcut kuponu güncelle
        const updatePrizeQuery = `
          UPDATE user_prizes 
          SET 
            prize_value = ?, 
            title = ?, 
            description = CONCAT(description, ' - Çift-tek oyununda 2 katına çıkarıldı!'),
            doubled = true
          WHERE spin_id = ? AND user_id = ?
        `;
        
        await connection.execute(updatePrizeQuery, [
          finalPrizeValue,
          `${finalPrizeValue} TL İndirim (2x)`,
          spinId,
          userId
        ]);
      }
      
      await connection.commit();
      
      return {
        won: userWon,
        randomNumber,
        choice,
        originalValue: spin.prize_value,
        finalValue: finalPrizeValue,
        message: userWon ? 
          `Tebrikler! Sayı ${randomNumber} (${isEven ? 'Çift' : 'Tek'}) - İndirimim 2 katına çıktı!` :
          `Sayı ${randomNumber} (${isEven ? 'Çift' : 'Tek'}) - Kaybettin ama ödülün korundu!`
      };
      
    } catch (error) {
      await connection.rollback();
      console.error('Double game error:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Haftada 1 kez sınırını resetle (test için)
   */
  async resetWeeklyLimit(userId) {
    try {
      const query = `
        UPDATE user_wheel_status 
        SET last_spin_date = DATE_SUB(NOW(), INTERVAL 8 DAY)
        WHERE user_id = ?
      `;
      
      await this.db.execute(query, [userId]);
      
      return { success: true };
    } catch (error) {
      console.error('Error resetting weekly limit:', error);
      throw new Error('Haftalık sınır sıfırlanamadı');
    }
  }

  /**
   * Kullanıcının aktif kuponlarını getir - Gelişmiş versiyon
   */
  async getUserActiveCoupons(userId) {
    try {
      const query = `
        SELECT 
          id,
          spin_id,
          prize_type,
          prize_value,
          title,
          description,
          created_at,
          expires_at,
          used,
          used_at,
          doubled,
          DATEDIFF(expires_at, NOW()) as days_remaining
        FROM user_prizes 
        WHERE user_id = ? 
          AND used = false 
          AND expires_at > NOW()
        ORDER BY created_at DESC
      `;
      
      const [rows] = await this.db.execute(query, [userId]);
      
      return rows.map(row => ({
        ...row,
        isExpiringSoon: row.days_remaining <= 3,
        formattedExpiryDate: new Date(row.expires_at).toLocaleDateString('tr-TR'),
        formattedCreatedDate: new Date(row.created_at).toLocaleDateString('tr-TR')
      }));
    } catch (error) {
      console.error('Error getting user active coupons:', error);
      throw new Error('Kuponlar alınamadı');
    }
  }

  /**
   * Kupon detaylarını getir
   */
  async getCouponDetails(userId, couponId) {
    try {
      const query = `
        SELECT 
          up.*,
          ws.spin_date,
          ws.user_ip,
          dg.won as doubled_in_game,
          dg.random_number,
          dg.user_choice
        FROM user_prizes up
        LEFT JOIN wheel_spins ws ON up.spin_id = ws.id
        LEFT JOIN double_games dg ON up.spin_id = dg.spin_id
        WHERE up.id = ? AND up.user_id = ?
      `;
      
      const [rows] = await this.db.execute(query, [couponId, userId]);
      
      if (rows.length === 0) {
        return null;
      }
      
      const coupon = rows[0];
      
      return {
        ...coupon,
        formattedSpinDate: new Date(coupon.spin_date).toLocaleDateString('tr-TR'),
        formattedExpiryDate: new Date(coupon.expires_at).toLocaleDateString('tr-TR'),
        daysRemaining: Math.ceil((new Date(coupon.expires_at) - new Date()) / (1000 * 60 * 60 * 24))
      };
    } catch (error) {
      console.error('Error getting coupon details:', error);
      throw new Error('Kupon detayları alınamadı');
    }
  }

  /**
   * Kullanıcının tüm kuponlarını getir (admin için)
   */
  async getAllUserCoupons(userId) {
    try {
      const query = `
        SELECT 
          up.*,
          ws.spin_date,
          dg.won as doubled_in_game
        FROM user_prizes up
        LEFT JOIN wheel_spins ws ON up.spin_id = ws.id
        LEFT JOIN double_games dg ON up.spin_id = dg.spin_id
        WHERE up.user_id = ?
        ORDER BY up.created_at DESC
      `;
      
      const [rows] = await this.db.execute(query, [userId]);
      
      return rows.map(row => ({
        ...row,
        status: row.used ? 'Kullanıldı' : 
                (new Date(row.expires_at) < new Date() ? 'Süresi Dolmuş' : 'Aktif'),
        formattedSpinDate: new Date(row.spin_date).toLocaleDateString('tr-TR'),
        formattedExpiryDate: new Date(row.expires_at).toLocaleDateString('tr-TR')
      }));
    } catch (error) {
      console.error('Error getting all user coupons:', error);
      throw new Error('Kuponlar alınamadı');
    }
  }

  /**
   * Kullanıcının çark durumunu getir - Gelişmiş versiyon
   */
  async getUserWheelStatus(userId) {
    try {
      const statusQuery = `
        SELECT 
          last_spin_date,
          total_spins,
          streak,
          longest_streak,
          CASE 
            WHEN last_spin_date IS NULL THEN true
            WHEN last_spin_date < DATE_SUB(NOW(), INTERVAL 7 DAY) THEN true
            ELSE false
          END as can_spin
        FROM user_wheel_status 
        WHERE user_id = ?
      `;
      
      const [statusRows] = await this.db.execute(statusQuery, [userId]);
      
      // Aktif kuponları say
      const couponQuery = `
        SELECT COUNT(*) as active_count, SUM(prize_value) as total_value
        FROM user_prizes 
        WHERE user_id = ? AND used = false AND expires_at > NOW()
      `;
      
      const [couponRows] = await this.db.execute(couponQuery, [userId]);
      
      const status = statusRows.length > 0 ? statusRows[0] : {
        last_spin_date: null,
        total_spins: 0,
        streak: 0,
        longest_streak: 0,
        can_spin: true
      };
      
      const coupons = couponRows[0] || { active_count: 0, total_value: 0 };
      
      return {
        canSpin: status.can_spin === 1,
        totalSpins: status.total_spins || 0,
        streak: status.streak || 0,
        longestStreak: status.longest_streak || 0,
        lastSpinDate: status.last_spin_date,
        activePrizes: {
          count: parseInt(coupons.active_count) || 0,
          totalValue: parseFloat(coupons.total_value) || 0
        },
        wheelMode: this.determineWheelMode(userId, status),
        nextSpinDate: status.last_spin_date ? 
          new Date(new Date(status.last_spin_date).getTime() + 7 * 24 * 60 * 60 * 1000) : 
          null
      };
    } catch (error) {
      console.error('Error getting user wheel status:', error);
      throw new Error('Kullanıcı durumu alınamadı');
    }
  }

  /**
   * Çark modunu belirle (normal, birthday, streak bonusu vs)
   */
  determineWheelMode(userId, status) {
    // Basit mod belirleme - ihtiyaca göre genişletilebilir
    if (status.streak >= 5) {
      return 'streak'; // Streak bonusu
    }
    
    const now = new Date();
    if (now.getDay() === 5) { // Cuma
      return 'friday'; // Cuma bonusu
    }
    
    return 'normal';
  }

  /**
   * Çark istatistikleri - Gelişmiş versiyon
   */
  async getWheelStats(startDate, endDate) {
    try {
      // Genel istatistikler
      const generalQuery = `
        SELECT 
          COUNT(*) as total_spins,
          COUNT(DISTINCT user_id) as unique_users,
          AVG(prize_value) as avg_prize_value,
          SUM(CASE WHEN prize_type != 'try_again' THEN prize_value ELSE 0 END) as total_prizes_value
        FROM wheel_spins 
        WHERE spin_date BETWEEN ? AND ?
      `;
      
      const [generalRows] = await this.db.execute(generalQuery, [startDate, endDate]);
      
      // Ödül dağılımı
      const prizesQuery = `
        SELECT 
          prize_type,
          prize_text,
          COUNT(*) as count,
          ROUND((COUNT(*) * 100.0 / (SELECT COUNT(*) FROM wheel_spins WHERE spin_date BETWEEN ? AND ?)), 2) as percentage
        FROM wheel_spins 
        WHERE spin_date BETWEEN ? AND ?
        GROUP BY prize_type, prize_text
        ORDER BY count DESC
      `;
      
      const [prizesRows] = await this.db.execute(prizesQuery, [startDate, endDate, startDate, endDate]);
      
      // Çift-tek oyunu istatistikleri
      const doubleGameQuery = `
        SELECT 
          COUNT(*) as total_games,
          SUM(CASE WHEN won = true THEN 1 ELSE 0 END) as won_games,
          ROUND((SUM(CASE WHEN won = true THEN 1 ELSE 0 END) * 100.0 / COUNT(*)), 2) as win_percentage
        FROM double_games dg
        JOIN wheel_spins ws ON dg.spin_id = ws.id
        WHERE ws.spin_date BETWEEN ? AND ?
      `;
      
      const [doubleGameRows] = await this.db.execute(doubleGameQuery, [startDate, endDate]);
      
      return {
        period: { startDate, endDate },
        general: generalRows[0],
        prizeDistribution: prizesRows,
        doubleGameStats: doubleGameRows[0] || { total_games: 0, won_games: 0, win_percentage: 0 }
      };
    } catch (error) {
      console.error('Error getting wheel stats:', error);
      throw new Error('İstatistikler alınamadı');
    }
  }
}

module.exports = WheelService;